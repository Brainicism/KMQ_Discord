export default interface ActivitySongInfoArgs {
    /** Guild whose game options decide `includedInOptions`, and whose locale
     *  picks the localized song / artist names. */
    guildID: string;
    /** YouTube video ID of the song to look up. */
    youtubeLink: string;
}
