import type { GenderModeOptions } from "../enums/option_types/gender";
import type GuessModeType from "../enums/option_types/guess_mode_type";
import type MultiGuessType from "../enums/option_types/multiguess_type";

/**
 * Subset of GuildPreference the Activity panel surfaces today. Starts with
 * flat-enum options (Slice 1 of Phase 4); numeric and autocomplete-driven
 * options land in later slices.
 */
export default interface ActivityOptionsSnapshot {
    gender: GenderModeOptions[];
    guessMode: GuessModeType;
    multiguess: MultiGuessType;
}
