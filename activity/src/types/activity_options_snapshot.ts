// Mirror of src/interfaces/activity_options_snapshot.ts. The Activity
// bundle ships independently of the bot's TS, so the enums are inlined as
// string unions to avoid a cross-tree import.

export type ActivityGender = "male" | "female" | "coed" | "alternating";
export type ActivityGuessMode = "song" | "artist" | "both";
export type ActivityMultiguess = "on" | "off";
export type ActivityShuffle =
    | "random"
    | "weighted_easy"
    | "weighted_hard"
    | "popularity"
    | "chronological"
    | "reversechronological";
export type ActivitySeek = "beginning" | "random" | "middle";
export type ActivityLanguage = "korean" | "all";
export type ActivityRelease = "official" | "bside" | "all";
export type ActivityArtistType = "soloists" | "groups" | "both";
export type ActivitySubunits = "include" | "exclude";
export type ActivityAnswerType =
    | "typing"
    | "typingtypos"
    | "easy"
    | "medium"
    | "hard"
    | "hidden";
export type ActivityOst = "include" | "exclude" | "exclusive";
export type ActivitySpecial =
    | "reverse"
    | "slow"
    | "fast"
    | "faster"
    | "lowpitch"
    | "highpitch"
    | "nightcore";

export interface ActivityArtist {
    id: number;
    name: string;
}

export default interface ActivityOptionsSnapshot {
    gender: ActivityGender[];
    guessMode: ActivityGuessMode;
    multiguess: ActivityMultiguess;
    limitStart: number;
    limitEnd: number;
    beginningYear: number;
    endYear: number;
    goal: number | null;
    timer: number | null;
    duration: number | null;
    shuffle: ActivityShuffle;
    seek: ActivitySeek;
    language: ActivityLanguage;
    release: ActivityRelease;
    artisttype: ActivityArtistType;
    subunits: ActivitySubunits;
    answerType: ActivityAnswerType;
    ost: ActivityOst;
    special: ActivitySpecial | null;
    groups: ActivityArtist[] | null;
    includes: ActivityArtist[] | null;
    excludes: ActivityArtist[] | null;
    /**
     * Active playlist (set via `/playlist` or the panel), or null when none.
     * When set, the song-pool filters are overridden by the playlist; the
     * matched-song count is reflected in `limitEnd`.
     */
    playlist: { type: "spotify" | "youtube"; identifier: string } | null;
    /**
     * Total number of songs matching the current filters before the `limit`
     * window is applied — i.e. the effective upper bound for `limitEnd`. Null
     * when the count couldn't be computed (e.g. a song-data load failure).
     */
    matchedSongCount: number | null;
}
