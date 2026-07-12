import type { WebRoomMemberInfo } from "../structures/web_room_state";
import type GameType from "../enums/game_type";

export default interface ActivityStartGameArgs {
    guildID: string;
    userID: string;
    voiceChannelID: string;
    textChannelID: string;
    /** Defaults to CLASSIC. Restricted server-side to the Activity-supported
     *  subset (classic / suddendeath / elimination / clip). */
    gameType: GameType;
    /** Lives per player for elimination mode; ignored otherwise. */
    eliminationLives?: number;
    /** Clip length in seconds for clip mode; ignored otherwise. */
    clipDuration?: number;
    /** "web": a standalone-website room game (guildID is a synthetic room
     *  ID, channel IDs are empty, and `members` seeds the worker's
     *  membership mirror). Absent for the embedded Activity. */
    mode?: "web";
    /** Room membership at start time (web mode only) — embedded here so the
     *  session never races the separate membership push. */
    members?: WebRoomMemberInfo[];
}
