import {
    WEB_ROOM_DISCONNECT_GRACE_MS,
    WEB_ROOM_ID_FLAG,
    WEB_ROOM_MAX_MEMBERS,
} from "../../../constants";
import { describe } from "mocha";
import WebRoomManager from "../../../web_room_manager";
import assert from "assert";
import type { WebRoomMemberIdentity } from "../../../web_room_manager";

const user = (n: number, isGuest = false): WebRoomMemberIdentity => ({
    id: (100000000000000000n + BigInt(n)).toString(),
    username: `user${n}`,
    avatarUrl: null,
    isGuest,
});

describe("web room manager", () => {
    let clock: { now: number };
    let closed: Array<{ roomID: string; lastMemberID: string }>;
    let manager: WebRoomManager;

    beforeEach(() => {
        clock = { now: 1_000_000 };
        closed = [];
        manager = new WebRoomManager({
            now: () => clock.now,
            onRoomClosed: (roomID, lastMemberID) => {
                closed.push({ roomID, lastMemberID });
            },
        });
    });

    describe("room IDs", () => {
        it("derives a synthetic guild ID above the snowflake range", () => {
            const roomID = WebRoomManager.roomIDForOwner(user(1).id);
            assert.strictEqual(BigInt(roomID) & WEB_ROOM_ID_FLAG, 1n << 62n);
            assert.strictEqual(
                BigInt(roomID) & ~WEB_ROOM_ID_FLAG,
                BigInt(user(1).id),
            );
        });

        it("is deterministic per owner", () => {
            const first = manager.createRoom(user(1));
            assert.ok("room" in first);
            const { roomID } = first.room;
            manager.leaveRoom(user(1).id);

            const second = manager.createRoom(user(1));
            assert.ok("room" in second);
            assert.strictEqual(second.room.roomID, roomID);
            // But the invite code rotates with each new room.
            assert.notStrictEqual(second.room.code, first.room.code);
        });
    });

    describe("create/join/leave", () => {
        it("creates a room with the creator as sole member and owner", () => {
            const result = manager.createRoom(user(1));
            assert.ok("room" in result);
            assert.strictEqual(result.room.ownerID, user(1).id);
            assert.deepStrictEqual(
                [...result.room.members.keys()],
                [user(1).id],
            );

            assert.strictEqual(
                manager.getRoomByCode(result.room.code),
                result.room,
            );

            assert.strictEqual(manager.getRoomForUser(user(1).id), result.room);
        });

        it("joins by code and rejects unknown codes", () => {
            const created = manager.createRoom(user(1));
            assert.ok("room" in created);

            const joined = manager.joinRoom(created.room.code, user(2));
            assert.ok("room" in joined);
            assert.strictEqual(joined.room.members.size, 2);

            assert.deepStrictEqual(manager.joinRoom("nope", user(3)), {
                error: "not_found",
            });
        });

        it("enforces the member cap", () => {
            const created = manager.createRoom(user(1));
            assert.ok("room" in created);
            for (let i = 2; i <= WEB_ROOM_MAX_MEMBERS; i++) {
                assert.ok(
                    "room" in manager.joinRoom(created.room.code, user(i)),
                );
            }

            assert.deepStrictEqual(
                manager.joinRoom(created.room.code, user(99)),
                { error: "full" },
            );

            // Existing members can still "re-join" (identity refresh).
            assert.ok("room" in manager.joinRoom(created.room.code, user(2)));
        });

        it("moves a user between rooms on join", () => {
            const first = manager.createRoom(user(1));
            const second = manager.createRoom(user(2));
            assert.ok("room" in first && "room" in second);

            assert.ok("room" in manager.joinRoom(first.room.code, user(3)));
            assert.ok("room" in manager.joinRoom(second.room.code, user(3)));

            assert.strictEqual(first.room.members.has(user(3).id), false);
            assert.strictEqual(second.room.members.has(user(3).id), true);
            assert.strictEqual(manager.getRoomForUser(user(3).id), second.room);
        });

        it("transfers ownership to the longest-standing member on owner leave", () => {
            const created = manager.createRoom(user(1));
            assert.ok("room" in created);
            manager.joinRoom(created.room.code, user(2));
            manager.joinRoom(created.room.code, user(3));

            manager.leaveRoom(user(1).id);
            assert.strictEqual(created.room.ownerID, user(2).id);
            assert.strictEqual(closed.length, 0);
        });

        it("closes the room when the last member leaves", () => {
            const created = manager.createRoom(user(1));
            assert.ok("room" in created);
            manager.leaveRoom(user(1).id);

            assert.strictEqual(
                manager.getRoomByCode(created.room.code),
                undefined,
            );

            assert.deepStrictEqual(closed, [
                { roomID: created.room.roomID, lastMemberID: user(1).id },
            ]);
        });

        it("rejoins the creator's still-alive room instead of colliding room IDs", () => {
            const created = manager.createRoom(user(1));
            assert.ok("room" in created);
            manager.joinRoom(created.room.code, user(2));

            // Creator leaves; the room lives on under user 2.
            manager.leaveRoom(user(1).id);
            assert.strictEqual(created.room.ownerID, user(2).id);

            // "Create" now lands them back in that room — two rooms can
            // never share the creator-derived room ID.
            const again = manager.createRoom(user(1));
            assert.ok("room" in again);
            assert.strictEqual(again.room, created.room);
            assert.strictEqual(again.room.members.size, 2);
        });
    });

    describe("presence and sweep", () => {
        it("marks members connected/disconnected by socket count", () => {
            const created = manager.createRoom(user(1));
            assert.ok("room" in created);
            const { code } = created.room;

            let serialized = manager.serializeRoom(created.room);
            assert.strictEqual(serialized.members[0]!.connected, false);

            // Two tabs open, one closes: still connected.
            manager.memberConnected(code, user(1).id);
            manager.memberConnected(code, user(1).id);
            manager.memberDisconnected(code, user(1).id);
            serialized = manager.serializeRoom(created.room);
            assert.strictEqual(serialized.members[0]!.connected, true);

            manager.memberDisconnected(code, user(1).id);
            serialized = manager.serializeRoom(created.room);
            assert.strictEqual(serialized.members[0]!.connected, false);
        });

        it("sweeps members disconnected past the grace period", () => {
            const created = manager.createRoom(user(1));
            assert.ok("room" in created);
            const { code } = created.room;
            manager.memberConnected(code, user(1).id);
            manager.joinRoom(code, user(2));
            manager.memberConnected(code, user(2).id);
            manager.memberDisconnected(code, user(2).id);

            // Within grace: nothing happens.
            clock.now += WEB_ROOM_DISCONNECT_GRACE_MS - 1;
            manager.sweep();
            assert.strictEqual(created.room.members.size, 2);

            // Past grace: the disconnected member is dropped.
            clock.now += 2;
            manager.sweep();
            assert.strictEqual(created.room.members.size, 1);
            assert.strictEqual(created.room.members.has(user(1).id), true);
        });

        it("sweeps members who joined but never connected", () => {
            const created = manager.createRoom(user(1));
            assert.ok("room" in created);
            manager.memberConnected(created.room.code, user(1).id);
            manager.joinRoom(created.room.code, user(2));

            clock.now += WEB_ROOM_DISCONNECT_GRACE_MS + 1;
            manager.sweep();
            assert.strictEqual(created.room.members.has(user(2).id), false);
        });

        it("closes an all-disconnected room via sweep", () => {
            const created = manager.createRoom(user(1));
            assert.ok("room" in created);
            const { code, roomID } = created.room;
            manager.memberConnected(code, user(1).id);
            manager.memberDisconnected(code, user(1).id);

            clock.now += WEB_ROOM_DISCONNECT_GRACE_MS + 1;
            manager.sweep();

            assert.strictEqual(manager.getRoomByCode(code), undefined);
            assert.strictEqual(closed.length, 1);
            assert.strictEqual(closed[0]!.roomID, roomID);
        });

        it("a reconnect within grace clears the disconnect timer", () => {
            const created = manager.createRoom(user(1));
            assert.ok("room" in created);
            const { code } = created.room;
            manager.memberConnected(code, user(1).id);
            manager.memberDisconnected(code, user(1).id);

            clock.now += WEB_ROOM_DISCONNECT_GRACE_MS - 1;
            manager.memberConnected(code, user(1).id);

            clock.now += WEB_ROOM_DISCONNECT_GRACE_MS * 5;
            manager.sweep();
            assert.strictEqual(created.room.members.has(user(1).id), true);
        });
    });

    describe("serialization", () => {
        it("exposes only client-safe member fields", () => {
            const created = manager.createRoom(user(1));
            assert.ok("room" in created);

            const serialized = manager.serializeRoom(created.room);
            assert.deepStrictEqual(serialized, {
                code: created.room.code,
                ownerID: user(1).id,
                visibility: "private",
                hasPassword: false,
                members: [
                    {
                        id: user(1).id,
                        username: "user1",
                        avatarUrl: null,
                        connected: false,
                    },
                ],
            });
        });
    });

    describe("visibility and public listing", () => {
        it("defaults to a private, unlisted room", () => {
            const created = manager.createRoom(user(1));
            assert.ok("room" in created);
            assert.strictEqual(created.room.visibility, "private");
            assert.deepStrictEqual(manager.listPublicRooms(), []);
        });

        it("lists public rooms with owner name and counts, newest first", () => {
            const a = manager.createRoom(user(1), { visibility: "public" });
            assert.ok("room" in a);
            manager.joinRoom(a.room.code, user(2));

            clock.now += 1000;
            const b = manager.createRoom(user(3), { visibility: "public" });
            assert.ok("room" in b);

            // A private room stays out of the list.
            manager.createRoom(user(4), { visibility: "private" });

            const list = manager.listPublicRooms();
            assert.strictEqual(list.length, 2);
            // Newest (user3's) first.
            assert.strictEqual(list[0]!.code, b.room.code);
            assert.strictEqual(list[0]!.ownerUsername, "user3");
            assert.strictEqual(list[0]!.memberCount, 1);
            assert.strictEqual(list[0]!.hasPassword, false);
            assert.strictEqual(list[1]!.code, a.room.code);
            assert.strictEqual(list[1]!.memberCount, 2);
        });
    });

    describe("password-protected rooms", () => {
        it("rejects a join with a wrong/missing password and accepts the right one", () => {
            const created = manager.createRoom(user(1), {
                visibility: "public",
                password: "hunter2",
            });

            assert.ok("room" in created);
            const { code } = created.room;

            assert.deepStrictEqual(manager.joinRoom(code, user(2)), {
                error: "wrong_password",
            });

            assert.deepStrictEqual(manager.joinRoom(code, user(2), "nope"), {
                error: "wrong_password",
            });

            assert.ok("room" in manager.joinRoom(code, user(2), "hunter2"));
            assert.strictEqual(created.room.members.size, 2);
        });

        it("surfaces the password requirement without leaking the password", () => {
            const created = manager.createRoom(user(1), {
                visibility: "public",
                password: "secret",
            });

            assert.ok("room" in created);

            const serialized = manager.serializeRoom(created.room);
            assert.strictEqual(serialized.hasPassword, true);
            assert.ok(!("passwordHash" in serialized));

            const summary = manager.listPublicRooms()[0]!;
            assert.strictEqual(summary.hasPassword, true);
        });

        it("lets an existing member reconnect without re-supplying the password", () => {
            const created = manager.createRoom(user(1), {
                password: "pw",
            });

            assert.ok("room" in created);
            // The owner is already a member; a bare join refreshes identity.
            assert.ok("room" in manager.joinRoom(created.room.code, user(1)));
        });

        it("re-applies visibility and password when the owner recreates the room", () => {
            const created = manager.createRoom(user(1), {
                visibility: "public",
            });

            assert.ok("room" in created);
            manager.joinRoom(created.room.code, user(2));
            manager.leaveRoom(user(1).id);

            // Owner recreates → same room, now private + locked.
            const again = manager.createRoom(user(1), {
                visibility: "private",
                password: "locked",
            });

            assert.ok("room" in again);
            assert.strictEqual(again.room, created.room);
            assert.strictEqual(again.room.visibility, "private");
            assert.strictEqual(again.room.passwordHash !== null, true);
        });
    });
});
