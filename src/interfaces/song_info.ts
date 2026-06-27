/**
 * Render-ready lookup metadata for a single song. Pure data (no Discord/embed
 * concerns) so both the `/lookup` slash command and the Activity can present
 * it however they like. Numbers are raw (the renderer formats them) and the
 * publish date is an ISO 8601 string rather than Discord `<t:>` markup.
 */
export default interface SongInfo {
    /** Whether the song is in KMQ's playable set (vs. only the source DB). */
    inKMQ: boolean;
    /** Localized song name. */
    songName: string;
    /** Localized artist name. */
    artistName: string;
    youtubeLink: string;
    thumbnailUrl: string;
    /** kpop.daisuki.com.br page for the song. */
    daisukiLink: string;
    views: number;
    /** Release date as an ISO 8601 string (the renderer formats per locale). */
    publishDate: string;
    songAliases: string[];
    artistAliases: string[];
    /** Emoji string for the song's tags (may be empty). */
    tags: string;
    /** Clip duration in seconds, or null when unknown / not in KMQ. */
    durationSeconds: number | null;
    /** Whether the song matches the guild's current game options, or null when
     *  not in KMQ (no options context applies). */
    includedInOptions: boolean | null;
    /** Aggregate guess stats, or null when the song has never been played. */
    guessStats: { correctGuesses: number; roundsPlayed: number } | null;
}
