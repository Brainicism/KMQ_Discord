import {
    WEB_GUEST_ID_FLAG,
    WEB_SESSION_TOKEN_PREFIX,
    WEB_SESSION_TTL_MS,
} from "../../../constants";
import {
    createWebSession,
    deleteWebSession,
    hashWebSessionToken,
    isGuestUserID,
    isWebSessionToken,
    mintGuestUserID,
    resolveWebSession,
    sanitizeGuestUsername,
} from "../../../helpers/web_session_manager";
import { describe } from "mocha";
import WebRoomManager from "../../../web_room_manager";
import assert from "assert";
import dbContext from "../../../database_context";

const TEST_USER = {
    id: "123456789012345678",
    username: "tester",
    avatarUrl: "https://cdn.discordapp.com/avatars/1/2.png",
    locale: "ko",
};

describe("web session manager", () => {
    beforeEach(async () => {
        await dbContext.kmq.deleteFrom("web_sessions").execute();
    });

    describe("token classification", () => {
        it("identifies web session tokens by prefix", () => {
            assert.strictEqual(
                isWebSessionToken(`${WEB_SESSION_TOKEN_PREFIX}abc`),
                true,
            );

            // Discord OAuth access tokens (Activity path) must not match.
            assert.strictEqual(isWebSessionToken("abc123"), false);
            assert.strictEqual(isWebSessionToken(""), false);
        });

        it("hashes deterministically to sha256 hex", () => {
            const hash = hashWebSessionToken("web_sometoken");
            assert.strictEqual(hash, hashWebSessionToken("web_sometoken"));
            assert.match(hash, /^[0-9a-f]{64}$/);
            assert.notStrictEqual(hash, hashWebSessionToken("web_other"));
        });
    });

    describe("createWebSession", () => {
        it("returns a prefixed token and stores only its hash", async () => {
            const token = await createWebSession(TEST_USER);
            assert.ok(token.startsWith(WEB_SESSION_TOKEN_PREFIX));

            const rows = await dbContext.kmq
                .selectFrom("web_sessions")
                .selectAll()
                .execute();

            assert.strictEqual(rows.length, 1);
            assert.strictEqual(rows[0]!.token_hash, hashWebSessionToken(token));
            assert.strictEqual(rows[0]!.user_id, TEST_USER.id);
            // Raw token must never be persisted.
            assert.notStrictEqual(rows[0]!.token_hash, token);
        });
    });

    describe("resolveWebSession", () => {
        it("round-trips a created session to its user", async () => {
            const token = await createWebSession(TEST_USER);
            const user = await resolveWebSession(token);
            assert.deepStrictEqual(user, TEST_USER);
        });

        it("returns null for non-web tokens without touching the DB", async () => {
            assert.strictEqual(await resolveWebSession("discordtoken"), null);
        });

        it("returns null for unknown tokens", async () => {
            assert.strictEqual(
                await resolveWebSession(`${WEB_SESSION_TOKEN_PREFIX}unknown`),
                null,
            );
        });

        it("deletes and rejects expired sessions", async () => {
            const token = await createWebSession(TEST_USER);
            await dbContext.kmq
                .updateTable("web_sessions")
                .set({ expires_at: new Date(Date.now() - 1000) })
                .execute();

            assert.strictEqual(await resolveWebSession(token), null);

            const rows = await dbContext.kmq
                .selectFrom("web_sessions")
                .selectAll()
                .execute();

            assert.strictEqual(rows.length, 0);
        });

        it("slides expiry forward when last use is stale", async () => {
            const token = await createWebSession(TEST_USER);
            const staleDate = new Date(Date.now() - 2 * 60 * 60 * 1000);
            const nearExpiry = new Date(Date.now() + 60_000);
            await dbContext.kmq
                .updateTable("web_sessions")
                .set({ last_used_at: staleDate, expires_at: nearExpiry })
                .execute();

            assert.ok(await resolveWebSession(token));

            const row = await dbContext.kmq
                .selectFrom("web_sessions")
                .selectAll()
                .executeTakeFirstOrThrow();

            // Full TTL restored (allow generous slop for MySQL second
            // truncation and test latency).
            const expectedMin = Date.now() + WEB_SESSION_TTL_MS - 5 * 60 * 1000;

            assert.ok(row.expires_at.getTime() > expectedMin);
            assert.ok(row.last_used_at.getTime() > staleDate.getTime());
        });

        it("does not write on every resolve for hot sessions", async () => {
            const token = await createWebSession(TEST_USER);
            const before = await dbContext.kmq
                .selectFrom("web_sessions")
                .selectAll()
                .executeTakeFirstOrThrow();

            assert.ok(await resolveWebSession(token));

            const after = await dbContext.kmq
                .selectFrom("web_sessions")
                .selectAll()
                .executeTakeFirstOrThrow();

            assert.strictEqual(
                after.last_used_at.getTime(),
                before.last_used_at.getTime(),
            );

            assert.strictEqual(
                after.expires_at.getTime(),
                before.expires_at.getTime(),
            );
        });
    });

    describe("deleteWebSession", () => {
        it("invalidates the session (logout)", async () => {
            const token = await createWebSession(TEST_USER);
            await deleteWebSession(token);
            assert.strictEqual(await resolveWebSession(token), null);
        });

        it("is a no-op for unknown tokens", async () => {
            await deleteWebSession(`${WEB_SESSION_TOKEN_PREFIX}unknown`);
        });
    });

    describe("guest identities", () => {
        it("mints numeric IDs carrying both guest flag bits", () => {
            const id = mintGuestUserID();
            assert.match(id, /^\d+$/);
            assert.strictEqual(
                BigInt(id) & WEB_GUEST_ID_FLAG,
                WEB_GUEST_ID_FLAG,
            );

            // Effectively unique: 60 random bits.
            assert.notStrictEqual(id, mintGuestUserID());
        });

        it("classifies guest IDs apart from snowflakes and room IDs", () => {
            assert.strictEqual(isGuestUserID(mintGuestUserID()), true);

            // Real Discord snowflake.
            assert.strictEqual(isGuestUserID("123456789012345678"), false);
            // Room guild ID (bit 62 only).
            assert.strictEqual(
                isGuestUserID(WebRoomManager.roomIDForOwner("123456789")),
                false,
            );
            assert.strictEqual(isGuestUserID("not-a-number"), false);
        });

        it("round-trips a guest session like any other", async () => {
            const guest = {
                id: mintGuestUserID(),
                username: "guesty",
                avatarUrl: null,
                locale: "en-US",
            };

            const token = await createWebSession(guest);
            assert.deepStrictEqual(await resolveWebSession(token), guest);
        });

        it("sanitizes self-chosen guest names", () => {
            assert.strictEqual(sanitizeGuestUsername("  bob  "), "bob");
            // Control characters stripped, whitespace collapsed.
            assert.strictEqual(
                sanitizeGuestUsername("a\u0000b\u001fc  d"),
                "abc d",
            );

            assert.strictEqual(
                sanitizeGuestUsername("x".repeat(100)).length,
                32,
            );

            assert.strictEqual(sanitizeGuestUsername("   "), "Guest");
            assert.strictEqual(sanitizeGuestUsername(undefined), "Guest");
            assert.strictEqual(sanitizeGuestUsername(42), "Guest");
        });
    });
});
