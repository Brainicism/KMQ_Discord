import {
    WEB_ROOM_CODE_ALPHABET,
    WEB_ROOM_CODE_LENGTH,
    WEB_ROOM_DISCONNECT_GRACE_MS,
    WEB_ROOM_ID_FLAG,
    WEB_ROOM_MAX_GUESTS,
    WEB_ROOM_MAX_MEMBERS,
} from "./constants";
import crypto from "crypto";

/** Identity of a room member, as resolved from their bearer token. */
export interface WebRoomMemberIdentity {
    id: string;
    username: string;
    avatarUrl: string | null;
    /** Whether this is a website guest (no Discord account). */
    isGuest: boolean;
}

interface WebRoomMember extends WebRoomMemberIdentity {
    /**
     * Open websockets for this member (one per tab). Presence is derived:
     * connected means at least one open socket.
     */
    connections: number;

    /**
     * When connections last dropped to zero; members disconnected past the
     * grace period are removed by sweep(). Set at join time too, so a member
     * who never opens a websocket doesn't linger forever.
     */
    disconnectedAt: number | null;
}

/** Room visibility: public rooms appear in the browse list, private don't. */
// eslint-disable-next-line import/no-unused-modules
export type WebRoomVisibility = "public" | "private";

// eslint-disable-next-line import/no-unused-modules
export interface WebRoom {
    /** Shareable, unguessable invite code; doubles as the instance_id. */
    code: string;

    /** Synthetic guild ID; see WEB_ROOM_ID_FLAG. */
    roomID: string;

    ownerID: string;

    createdAt: number;

    /**
     * Public rooms are listed in the browse lobby; private rooms are reachable
     * by invite code/link only. Independent of the optional password.
     */
    visibility: WebRoomVisibility;

    /**
     * Optional join password (sha256 of salt+password) — enforced on join
     * regardless of visibility, so an invite link to a locked room still
     * prompts. Null when the room is open.
     */
    passwordHash: string | null;
    passwordSalt: string | null;

    /** Keyed by user ID; insertion order determines owner succession. */
    members: Map<string, WebRoomMember>;
}

/** Room shape sent to clients. */
// eslint-disable-next-line import/no-unused-modules
export interface SerializedWebRoom {
    code: string;
    ownerID: string;
    visibility: WebRoomVisibility;
    hasPassword: boolean;
    members: Array<{
        id: string;
        username: string;
        avatarUrl: string | null;
        connected: boolean;
    }>;
}

/** Public-lobby list entry (never leaks the member roster or the password). */
// eslint-disable-next-line import/no-unused-modules
export interface PublicRoomSummary {
    code: string;
    ownerUsername: string;
    memberCount: number;
    maxMembers: number;
    hasPassword: boolean;
}

// eslint-disable-next-line import/no-unused-modules
export type WebRoomJoinResult =
    | { room: WebRoom }
    | { error: "not_found" | "full" | "wrong_password" | "guest_limit" };

/** Options for creating a room. */
// eslint-disable-next-line import/no-unused-modules
export interface CreateRoomOptions {
    visibility?: WebRoomVisibility;
    password?: string | null;
}

interface WebRoomManagerOptions {
    /**
     * Called when a room's last member is gone (explicit leave or sweep) —
     * the hook that ends any game running against the room's synthetic
     * guild ID.
     */
    onRoomClosed?: (roomID: string, lastMemberID: string) => void;

    /**
     * Called when a room's member set changes (create/join/leave) — the hook
     * that mirrors membership to the worker owning the room's guild ID.
     */
    onRoomChanged?: (room: WebRoom) => void;

    /** Clock override for tests. */
    now?: () => number;
}

/**
 * Admiral-side registry of standalone-website multiplayer rooms. Rooms are
 * in-memory only: an admiral restart drops them (members just recreate/rejoin;
 * game options and presets survive via the deterministic room ID).
 */
export default class WebRoomManager {
    private roomsByCode: Map<string, WebRoom> = new Map();

    private roomCodeByRoomID: Map<string, string> = new Map();

    private roomCodeByUserID: Map<string, string> = new Map();

    private onRoomClosed: (roomID: string, lastMemberID: string) => void;

    private onRoomChanged: (room: WebRoom) => void;

    private now: () => number;

    constructor(options: WebRoomManagerOptions = {}) {
        this.onRoomClosed = options.onRoomClosed ?? ((): void => {});
        this.onRoomChanged = options.onRoomChanged ?? ((): void => {});
        this.now = options.now ?? ((): number => Date.now());
    }

    /**
     * @param ownerID - the creating user's Discord ID
     * @returns the synthetic guild ID for that user's room
     */
    static roomIDForOwner(ownerID: string): string {
        return (WEB_ROOM_ID_FLAG | BigInt(ownerID)).toString();
    }

    /**
     * Creates a room owned by the user, leaving any room they're currently
     * in. If the room they created earlier is still alive (possible after
     * they left it and ownership transferred), they rejoin it instead —
     * room IDs are deterministic per creator, so two live rooms can never
     * share one.
     * @param user - the creating user
     * @param options - visibility + optional join password
     * @returns the created (or rejoined) room
     */
    createRoom(
        user: WebRoomMemberIdentity,
        options: CreateRoomOptions = {},
    ): WebRoomJoinResult {
        const visibility: WebRoomVisibility =
            options.visibility === "public" ? "public" : "private";

        const roomID = WebRoomManager.roomIDForOwner(user.id);
        const existingCode = this.roomCodeByRoomID.get(roomID);
        if (existingCode) {
            // Recreating one's own still-alive room re-applies the new
            // visibility/password (the owner reconfiguring it) and rejoins
            // without a password prompt — it's their own room.
            const existingRoom = this.roomsByCode.get(existingCode)!;
            const { hash, salt } = WebRoomManager.hashPassword(
                options.password,
            );

            existingRoom.visibility = visibility;
            existingRoom.passwordHash = hash;
            existingRoom.passwordSalt = salt;

            if (existingRoom.members.size >= WEB_ROOM_MAX_MEMBERS) {
                return { error: "full" };
            }

            this.leaveRoom(user.id);
            existingRoom.members.set(user.id, this.newMember(user));
            this.roomCodeByUserID.set(user.id, existingCode);
            this.onRoomChanged(existingRoom);
            return { room: existingRoom };
        }

        this.leaveRoom(user.id);

        const { hash, salt } = WebRoomManager.hashPassword(options.password);
        const room: WebRoom = {
            code: this.generateRoomCode(),
            roomID,
            ownerID: user.id,
            createdAt: this.now(),
            visibility,
            passwordHash: hash,
            passwordSalt: salt,
            members: new Map(),
        };

        room.members.set(user.id, this.newMember(user));
        this.roomsByCode.set(room.code, room);
        this.roomCodeByRoomID.set(roomID, room.code);
        this.roomCodeByUserID.set(user.id, room.code);
        this.onRoomChanged(room);
        return { room };
    }

    /**
     * Joins a room by invite code, leaving any current room first. Joining a
     * room the user is already in just refreshes their identity fields.
     * @param code - the invite code
     * @param user - the joining user
     * @param password - the supplied join password, if the room requires one
     * @returns the room, or why the join failed
     */
    joinRoom(
        code: string,
        user: WebRoomMemberIdentity,
        password?: string,
    ): WebRoomJoinResult {
        const room = this.roomsByCode.get(code);
        if (!room) {
            return { error: "not_found" };
        }

        const existing = room.members.get(user.id);
        if (existing) {
            // Already a member (reconnect/refresh): no password re-prompt.
            existing.username = user.username;
            existing.avatarUrl = user.avatarUrl;
            return { room };
        }

        if (!WebRoomManager.passwordMatches(room, password)) {
            return { error: "wrong_password" };
        }

        if (room.members.size >= WEB_ROOM_MAX_MEMBERS) {
            return { error: "full" };
        }

        // Cap anonymous guests per room; the owner (always a non-guest) plus
        // WEB_ROOM_MAX_GUESTS is the ceiling, so a room can't be filled purely
        // with unaccountable identities.
        if (user.isGuest) {
            const guestCount = [...room.members.values()].filter(
                (m) => m.isGuest,
            ).length;

            if (guestCount >= WEB_ROOM_MAX_GUESTS) {
                return { error: "guest_limit" };
            }
        }

        this.leaveRoom(user.id);
        room.members.set(user.id, this.newMember(user));
        this.roomCodeByUserID.set(user.id, code);
        this.onRoomChanged(room);
        return { room };
    }

    /**
     * @returns browse-list summaries of every public room, newest first. The
     * roster and password are never exposed — only the owner's name, the live
     * member count, and whether a password is required.
     */
    listPublicRooms(): PublicRoomSummary[] {
        return [...this.roomsByCode.values()]
            .filter((room) => room.visibility === "public")
            .sort((a, b) => b.createdAt - a.createdAt)
            .map((room) => ({
                code: room.code,
                ownerUsername:
                    room.members.get(room.ownerID)?.username ?? "KMQ player",
                memberCount: room.members.size,
                maxMembers: WEB_ROOM_MAX_MEMBERS,
                hasPassword: room.passwordHash !== null,
            }));
    }

    /**
     * Removes the user from whatever room they're in. Ownership passes to the
     * longest-standing remaining member; an emptied room is closed.
     * @param userID - the leaving user
     */
    leaveRoom(userID: string): void {
        const code = this.roomCodeByUserID.get(userID);
        if (!code) return;

        const room = this.roomsByCode.get(code);
        this.roomCodeByUserID.delete(userID);
        if (!room) return;

        room.members.delete(userID);

        if (room.members.size === 0) {
            this.closeRoom(room, userID);
            return;
        }

        if (room.ownerID === userID) {
            room.ownerID = room.members.keys().next().value as string;
        }

        this.onRoomChanged(room);
    }

    /**
     * @param code - the invite code
     * @returns the room, if it exists
     */
    getRoomByCode(code: string): WebRoom | undefined {
        return this.roomsByCode.get(code);
    }

    /**
     * @param userID - the user
     * @returns the room the user is currently in, if any
     */
    getRoomForUser(userID: string): WebRoom | undefined {
        const code = this.roomCodeByUserID.get(userID);
        return code ? this.roomsByCode.get(code) : undefined;
    }

    /**
     * Records a websocket open for a room member.
     * @param code - the room's invite code
     * @param userID - the member
     */
    memberConnected(code: string, userID: string): void {
        const member = this.roomsByCode.get(code)?.members.get(userID);
        if (!member) return;
        member.connections++;
        member.disconnectedAt = null;
    }

    /**
     * Records a websocket close for a room member; the grace period starts
     * when their last socket closes.
     * @param code - the room's invite code
     * @param userID - the member
     */
    memberDisconnected(code: string, userID: string): void {
        const member = this.roomsByCode.get(code)?.members.get(userID);
        if (!member) return;
        member.connections = Math.max(0, member.connections - 1);
        if (member.connections === 0) {
            member.disconnectedAt = this.now();
        }
    }

    /**
     * Drops members whose disconnect grace period has lapsed, transferring
     * ownership or closing rooms as needed. Called on an interval by the
     * web server.
     */
    sweep(): void {
        const cutoff = this.now() - WEB_ROOM_DISCONNECT_GRACE_MS;
        const expired: string[] = [];
        for (const room of this.roomsByCode.values()) {
            for (const member of room.members.values()) {
                if (
                    member.connections === 0 &&
                    member.disconnectedAt !== null &&
                    member.disconnectedAt <= cutoff
                ) {
                    expired.push(member.id);
                }
            }
        }

        for (const userID of expired) {
            this.leaveRoom(userID);
        }
    }

    /**
     * @param room - the room
     * @returns the client-facing room shape
     */
    serializeRoom(room: WebRoom): SerializedWebRoom {
        return {
            code: room.code,
            ownerID: room.ownerID,
            visibility: room.visibility,
            hasPassword: room.passwordHash !== null,
            members: [...room.members.values()].map((m) => ({
                id: m.id,
                username: m.username,
                avatarUrl: m.avatarUrl,
                connected: m.connections > 0,
            })),
        };
    }

    /**
     * @param password - the raw join password (or null/empty for no password)
     * @returns the salt + sha256(salt+password) to store, or nulls when open.
     * Rooms are ephemeral in-memory, so a fast salted hash is sufficient — it
     * just keeps the plaintext out of memory dumps and the serialized shape.
     */
    private static hashPassword(password: string | null | undefined): {
        hash: string | null;
        salt: string | null;
    } {
        if (!password) {
            return { hash: null, salt: null };
        }

        const salt = crypto.randomBytes(16).toString("hex");
        const hash = crypto
            .createHash("sha256")
            .update(salt + password)
            .digest("hex");

        return { hash, salt };
    }

    /**
     * @param room - the room whose password to check
     * @param password - the supplied password (may be undefined)
     * @returns whether the room is open or the password matches (timing-safe)
     */
    private static passwordMatches(
        room: WebRoom,
        password: string | undefined,
    ): boolean {
        if (!room.passwordHash || !room.passwordSalt) {
            return true;
        }

        if (typeof password !== "string" || password.length === 0) {
            return false;
        }

        const candidate = crypto
            .createHash("sha256")
            .update(room.passwordSalt + password)
            .digest("hex");

        const a = Buffer.from(candidate, "hex");
        const b = Buffer.from(room.passwordHash, "hex");
        return a.length === b.length && crypto.timingSafeEqual(a, b);
    }

    private newMember(user: WebRoomMemberIdentity): WebRoomMember {
        return {
            id: user.id,
            username: user.username,
            avatarUrl: user.avatarUrl,
            isGuest: user.isGuest,
            connections: 0,
            disconnectedAt: this.now(),
        };
    }

    /**
     * Generates an unguessable, human-readable invite code drawn from the
     * look-alike-free alphabet (see WEB_ROOM_CODE_ALPHABET), retrying on the
     * astronomically unlikely collision with a live room.
     * @returns a fresh room code not currently in use
     */
    private generateRoomCode(): string {
        for (;;) {
            let code = "";
            for (let i = 0; i < WEB_ROOM_CODE_LENGTH; i++) {
                code += WEB_ROOM_CODE_ALPHABET.charAt(
                    crypto.randomInt(WEB_ROOM_CODE_ALPHABET.length),
                );
            }

            if (!this.roomsByCode.has(code)) {
                return code;
            }
        }
    }

    private closeRoom(room: WebRoom, lastMemberID: string): void {
        this.roomsByCode.delete(room.code);
        this.roomCodeByRoomID.delete(room.roomID);
        this.onRoomClosed(room.roomID, lastMemberID);
    }
}
