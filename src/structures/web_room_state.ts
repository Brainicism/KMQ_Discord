import { WEB_ROOM_ID_FLAG } from "../constants";

/** A web room member as pushed from the admiral's WebRoomManager. */
export interface WebRoomMemberInfo {
    id: string;
    username: string;
    avatarUrl: string | null;
}

// Worker-side mirror of web room membership, keyed by the room's synthetic
// guild ID. Pushed by the admiral (on join/leave/sweep and embedded in
// startGame args, so a fresh session never races the first push); read by
// WebGameSession as its participant source.
const roomMembers = new Map<string, WebRoomMemberInfo[]>();

/**
 * @param guildID - a guild ID from any transport
 * @returns whether it's a web room's synthetic guild ID (bit 62 set —
 * unreachable by real Discord snowflakes until ~2049)
 */
// eslint-disable-next-line import/no-unused-modules
export function isWebRoomGuildID(guildID: string): boolean {
    try {
        return (BigInt(guildID) & WEB_ROOM_ID_FLAG) !== 0n;
    } catch {
        return false;
    }
}

/**
 * Replaces the membership snapshot for a room.
 * @param roomGuildID - the room's synthetic guild ID
 * @param members - the current members
 */
export function setWebRoomMembers(
    roomGuildID: string,
    members: WebRoomMemberInfo[],
): void {
    roomMembers.set(roomGuildID, members);
}

/**
 * @param roomGuildID - the room's synthetic guild ID
 * @returns the last pushed membership (empty if unknown)
 */
export function getWebRoomMembers(roomGuildID: string): WebRoomMemberInfo[] {
    return roomMembers.get(roomGuildID) ?? [];
}

/**
 * Drops a room's membership mirror (room closed).
 * @param roomGuildID - the room's synthetic guild ID
 */
export function clearWebRoomMembers(roomGuildID: string): void {
    roomMembers.delete(roomGuildID);
}
