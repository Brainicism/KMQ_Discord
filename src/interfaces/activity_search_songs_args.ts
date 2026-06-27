export default interface ActivitySearchSongsArgs {
    /** Raw (untrimmed, any case) song-name query. */
    query: string;
    /** Locale picking which localized name to match + return. */
    locale: string;
}
