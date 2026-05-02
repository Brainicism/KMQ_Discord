export default interface ActivitySessionMeta {
    guildID: string;
    voiceChannelID: string;
    textChannelID: string;
    startedAt: number;
    gameType: number;
    roundsPlayed: number;
    correctGuesses: number;
    ownerID: string;
}
