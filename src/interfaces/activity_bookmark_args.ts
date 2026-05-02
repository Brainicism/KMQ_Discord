export default interface ActivityBookmarkArgs {
    guildID: string;
    userID: string;
    /** If omitted, the worker bookmarks the current round's song. */
    youtubeLink?: string;
}
