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
}
