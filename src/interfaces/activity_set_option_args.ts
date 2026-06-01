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
    | { kind: "duration"; duration: number | null }
    | { kind: "shuffle"; shuffle: ShuffleType }
    | { kind: "seek"; seek: SeekType }
    | { kind: "language"; language: LanguageType }
    | { kind: "release"; release: ReleaseType }
    | { kind: "artisttype"; artisttype: ArtistType }
    | { kind: "subunits"; subunits: SubunitsPreference }
    // Artist-list kinds: empty array is treated as "reset to null" to
    // mirror the slash-command `/groups reset` flow.
    | { kind: "groups"; artistIDs: number[] }
    | { kind: "includes"; artistIDs: number[] }
    | { kind: "excludes"; artistIDs: number[] }
    // Playlist URL to match against, or null to clear the playlist (and the
    // limit it auto-sets), mirroring the slash-command `/playlist reset` flow.
    | { kind: "playlist"; playlistURL: string | null }
);

export default ActivitySetOptionArgs;
