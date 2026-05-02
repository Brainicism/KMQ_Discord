import type { GenderModeOptions } from "../enums/option_types/gender";
import type GuessModeType from "../enums/option_types/guess_mode_type";
import type MultiGuessType from "../enums/option_types/multiguess_type";

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
    /** Null (not in groups mode) or the selected artist list. */
    groups: ActivityArtist[] | null;
    includes: ActivityArtist[] | null;
    excludes: ActivityArtist[] | null;
}
