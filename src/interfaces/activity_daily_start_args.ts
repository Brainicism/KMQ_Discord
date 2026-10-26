export default interface ActivityDailyStartArgs {
    guildID: string;
    userID: string;
    textChannelID: string;
    /** "web" for a website room: no voice channel; members come inline. */
    mode?: "web";
    members?: Array<{ id: string; username: string; avatarUrl: string | null }>;
}
