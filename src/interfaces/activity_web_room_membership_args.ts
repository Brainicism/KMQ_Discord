import type { WebRoomMemberInfo } from "../structures/web_room_state";

export default interface ActivityWebRoomMembershipArgs {
    guildID: string;
    /** Full membership snapshot; empty means the room closed. */
    members: WebRoomMemberInfo[];
}
