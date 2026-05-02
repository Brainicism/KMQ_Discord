import type GameType from "../enums/game_type";

export default interface ActivitySessionMeta {
    guildID: string;
    voiceChannelID: string;
    textChannelID: string;
    startedAt: number;
    gameType: GameType;
    roundsPlayed: number;
    correctGuesses: number;
    ownerID: string;
}
