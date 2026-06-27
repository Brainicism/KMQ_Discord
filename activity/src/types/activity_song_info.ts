// Mirror of src/interfaces/song_info.ts + activity_song_info_response.ts. The
// Activity bundle ships independently of the bot's TS, so the shape is
// duplicated here rather than imported across the tree.

export interface ActivitySongInfo {
    inKMQ: boolean;
    songName: string;
    artistName: string;
    youtubeLink: string;
    thumbnailUrl: string;
    daisukiLink: string;
    views: number;
    /** ISO 8601 string; the client formats it per locale. */
    publishDate: string;
    songAliases: string[];
    artistAliases: string[];
    tags: string;
    durationSeconds: number | null;
    includedInOptions: boolean | null;
    guessStats: { correctGuesses: number; roundsPlayed: number } | null;
}

export interface ActivitySongInfoResponse {
    found: boolean;
    info?: ActivitySongInfo;
}

export interface ActivitySongSearchResult {
    youtubeLink: string;
    songName: string;
    artistName: string;
    publishYear: number;
}
