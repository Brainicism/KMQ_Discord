import type { GenderModeOptions } from "../enums/option_types/gender";
import type ArtistType from "../enums/option_types/artist_type";
import type GuessModeType from "../enums/option_types/guess_mode_type";
import type LanguageType from "../enums/option_types/language_type";
import type MultiGuessType from "../enums/option_types/multiguess_type";
import type ReleaseType from "../enums/option_types/release_type";
import type SeekType from "../enums/option_types/seek_type";
import type ShuffleType from "../enums/option_types/shuffle_type";
import type SubunitsPreference from "../enums/option_types/subunit_preference";

/**
 * Subset of GuildPreference the Activity panel surfaces today. Starts with
 * flat-enum options (Slice 1 of Phase 4); numeric and autocomplete-driven
 * options land in later slices.
 */
/**
 * Minimal shape the Activity needs to render an artist chip — id + name.
 * Matches MatchedArtist but drops the hangulName field the UI doesn't use.
 */
interface ActivityArtist {
    id: number;
    name: string;
}

export default interface ActivityOptionsSnapshot {
    gender: GenderModeOptions[];
    guessMode: GuessModeType;
    multiguess: MultiGuessType;
    limitStart: number;
    limitEnd: number;
    beginningYear: number;
    endYear: number;
    /** Null when the goal option isn't set (default). */
    goal: number | null;
    /** Seconds until a round times out; null when disabled. */
    timer: number | null;
    /** Session duration in minutes; null when unset (no time limit). */
    duration: number | null;
    /** How the eligible song pool is ordered/sampled each round. */
    shuffle: ShuffleType;
    /** Where in each song playback starts. */
    seek: SeekType;
    /** Song language filter (Korean-only vs all). */
    language: LanguageType;
    /** Which video release types are eligible. */
    release: ReleaseType;
    /** Soloists / groups / both. */
    artisttype: ArtistType;
    /** Whether subunits of selected groups are included. */
    subunits: SubunitsPreference;
    /** Null (not in groups mode) or the selected artist list. */
    groups: ActivityArtist[] | null;
    includes: ActivityArtist[] | null;
    excludes: ActivityArtist[] | null;
    /**
     * Active playlist (set via `/playlist` or the panel), or null when none.
     * When set, song-pool filters above are overridden by the playlist and the
     * matched-song count is reflected in `limitEnd`.
     */
    playlist: { type: "spotify" | "youtube"; identifier: string } | null;
}
