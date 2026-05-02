import type { GenderModeOptions } from "../enums/option_types/gender";
import type GuessModeType from "../enums/option_types/guess_mode_type";
import type MultiGuessType from "../enums/option_types/multiguess_type";

/**
 * Discriminated payload for the "setOption" admiral-to-worker IPC op. Each
 * shape matches one GuildPreference setter; the worker dispatches by `kind`.
 * An empty `genders` array (and `null` goal / timer) is treated as a reset
 * (mirrors the slash-command UX where no args → reset).
 */
type ActivitySetOptionArgs = {
    guildID: string;
    userID: string;
} & (
    | { kind: "gender"; genders: GenderModeOptions[] }
    | { kind: "guessMode"; guessMode: GuessModeType }
    | { kind: "multiguess"; multiguess: MultiGuessType }
    | { kind: "limit"; limitStart: number; limitEnd: number }
    | { kind: "cutoff"; beginningYear: number; endYear: number }
    | { kind: "goal"; goal: number | null }
    | { kind: "timer"; timer: number | null }
);

export default ActivitySetOptionArgs;
