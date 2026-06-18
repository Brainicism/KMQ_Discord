export default interface ActivitySessionMeta {
    guildID: string;
    voiceChannelID: string;
    textChannelID: string;
    startedAt: number;
    /** Server-side GameType string, e.g. "classic" | "elimination" | "clip". */
    gameType: string;
    roundsPlayed: number;
    correctGuesses: number;
    ownerID: string;
}
