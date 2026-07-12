import {
    WEB_GUEST_ID_FLAG,
    WEB_GUEST_USERNAME_MAX_LENGTH,
    WEB_SESSION_TOKEN_PREFIX,
    WEB_SESSION_TOUCH_INTERVAL_MS,
    WEB_SESSION_TTL_MS,
} from "../constants";
import crypto from "crypto";
import dbContext from "../database_context";

/**
 * Identity attached to a standalone-website login. Provider-agnostic on
 * purpose: rows come from Discord OAuth today, but nothing downstream assumes
 * that beyond `id` being a Discord snowflake (required for EXP/stats parity).
 */
// eslint-disable-next-line import/no-unused-modules
export interface WebSessionUser {
    id: string;
    username: string;
    avatarUrl: string | null;
    locale: string;
}

/**
 * @param token - the opaque bearer token held by the browser
 * @returns whether the token is a web session token (vs. a Discord OAuth
 * access token from the embedded Activity)
 */
export function isWebSessionToken(token: string): boolean {
    return token.startsWith(WEB_SESSION_TOKEN_PREFIX);
}

/**
 * @param token - the raw session token
 * @returns the sha256 hex digest stored in the DB (the raw token is never
 * persisted, so a DB leak doesn't leak usable bearer tokens)
 */
export function hashWebSessionToken(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Mints a synthetic numeric user ID for a guest login. Bits 62+61 set plus
 * 60 random bits — see WEB_GUEST_ID_FLAG for the disjointness argument. The
 * ID flows through every user-keyed code path (EXP, stats, scoreboards) as a
 * plain numeric string, just like a snowflake.
 * @returns a fresh guest user ID
 */
export function mintGuestUserID(): string {
    const random = crypto.randomBytes(8).readBigUInt64BE() >> 4n;
    return (WEB_GUEST_ID_FLAG | random).toString();
}

/**
 * @param userID - a user ID from any transport
 * @returns whether it's a synthetic guest ID (both flag bits set — real
 * snowflakes and room-owner IDs can't reach this range for decades)
 */
export function isGuestUserID(userID: string): boolean {
    try {
        return (BigInt(userID) & WEB_GUEST_ID_FLAG) === WEB_GUEST_ID_FLAG;
    } catch {
        return false;
    }
}

/**
 * Normalizes a guest's self-chosen display name: collapses whitespace,
 * strips control characters, and caps the length.
 * @param raw - the name as submitted
 * @returns a display-safe name, "Guest" if nothing usable remains
 */
export function sanitizeGuestUsername(raw: unknown): string {
    if (typeof raw !== "string") return "Guest";
    const cleaned = raw
        // eslint-disable-next-line no-control-regex
        .replace(/[\u0000-\u001f\u007f]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, WEB_GUEST_USERNAME_MAX_LENGTH)
        .trim();

    return cleaned || "Guest";
}

/**
 * Creates a new web session row and returns the raw bearer token.
 * @param user - the authenticated user's identity
 * @returns the raw token to hand to the browser
 */
export async function createWebSession(user: WebSessionUser): Promise<string> {
    const token = `${WEB_SESSION_TOKEN_PREFIX}${crypto
        .randomBytes(32)
        .toString("hex")}`;

    const now = new Date();
    await dbContext.kmq
        .insertInto("web_sessions")
        .values({
            token_hash: hashWebSessionToken(token),
            user_id: user.id,
            username: user.username,
            avatar_url: user.avatarUrl,
            locale: user.locale,
            created_at: now,
            expires_at: new Date(now.getTime() + WEB_SESSION_TTL_MS),
            last_used_at: now,
        })
        .execute();

    return token;
}

/**
 * Resolves a web session token to its user, enforcing expiry and sliding the
 * expiration forward. The sliding write is throttled to once per
 * WEB_SESSION_TOUCH_INTERVAL_MS so hot sessions don't write per request.
 * @param token - the raw bearer token from the Authorization header
 * @returns the session's user, or null if unknown/expired
 */
export async function resolveWebSession(
    token: string,
): Promise<WebSessionUser | null> {
    if (!isWebSessionToken(token)) return null;
    const tokenHash = hashWebSessionToken(token);
    const row = await dbContext.kmq
        .selectFrom("web_sessions")
        .selectAll()
        .where("token_hash", "=", tokenHash)
        .executeTakeFirst();

    if (!row) return null;

    const now = Date.now();
    if (row.expires_at.getTime() <= now) {
        await dbContext.kmq
            .deleteFrom("web_sessions")
            .where("token_hash", "=", tokenHash)
            .execute();

        return null;
    }

    if (now - row.last_used_at.getTime() > WEB_SESSION_TOUCH_INTERVAL_MS) {
        await dbContext.kmq
            .updateTable("web_sessions")
            .set({
                last_used_at: new Date(now),
                expires_at: new Date(now + WEB_SESSION_TTL_MS),
            })
            .where("token_hash", "=", tokenHash)
            .execute();
    }

    return {
        id: row.user_id,
        username: row.username,
        avatarUrl: row.avatar_url,
        locale: row.locale,
    };
}

/**
 * Deletes the session row for the given token (logout). No-op for unknown
 * tokens.
 * @param token - the raw bearer token to invalidate
 */
export async function deleteWebSession(token: string): Promise<void> {
    await dbContext.kmq
        .deleteFrom("web_sessions")
        .where("token_hash", "=", hashWebSessionToken(token))
        .execute();
}
