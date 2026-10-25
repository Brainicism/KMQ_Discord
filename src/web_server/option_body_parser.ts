import {
    ADVANCED_SETTING_MAX_DELAY_SEC,
    EARLIEST_BEGINNING_SEARCH_YEAR,
} from "../constants";
import { availableGenders } from "../enums/option_types/gender";
import AdvancedCommandAction from "../enums/advanced_setting_action_name";
import AnswerType from "../enums/option_types/answer_type";
import ArtistType from "../enums/option_types/artist_type";
import GameType from "../enums/game_type";
import GuessModeType from "../enums/option_types/guess_mode_type";
import LanguageType from "../enums/option_types/language_type";
import MultiGuessType from "../enums/option_types/multiguess_type";
import OstPreference from "../enums/option_types/ost_preference";
import ReleaseType from "../enums/option_types/release_type";
import SeekType from "../enums/option_types/seek_type";
import ShuffleType from "../enums/option_types/shuffle_type";
import SpecialType from "../enums/option_types/special_type";
import SubunitsPreference from "../enums/option_types/subunit_preference";
import type { GenderModeOptions } from "../enums/option_types/gender";

const GENDER_VALUES: ReadonlySet<string> = new Set(availableGenders);
const GUESS_MODE_VALUES: ReadonlySet<string> = new Set(
    Object.values(GuessModeType),
);

const MULTIGUESS_VALUES: ReadonlySet<string> = new Set(
    Object.values(MultiGuessType),
);

const SHUFFLE_VALUES: ReadonlySet<string> = new Set(Object.values(ShuffleType));
const ADVANCED_SETTING_VALUES: ReadonlySet<string> = new Set(
    Object.values(AdvancedCommandAction),
);

const SEEK_VALUES: ReadonlySet<string> = new Set(Object.values(SeekType));
const LANGUAGE_VALUES: ReadonlySet<string> = new Set(
    Object.values(LanguageType),
);

const RELEASE_VALUES: ReadonlySet<string> = new Set(Object.values(ReleaseType));
const ARTIST_TYPE_VALUES: ReadonlySet<string> = new Set(
    Object.values(ArtistType),
);

const SUBUNITS_VALUES: ReadonlySet<string> = new Set(
    Object.values(SubunitsPreference),
);

const ANSWER_TYPE_VALUES: ReadonlySet<string> = new Set(
    Object.values(AnswerType),
);

const OST_VALUES: ReadonlySet<string> = new Set(Object.values(OstPreference));
const SPECIAL_VALUES: ReadonlySet<string> = new Set(Object.values(SpecialType));

export const PRESET_ACTIONS: ReadonlySet<string> = new Set([
    "list",
    "save",
    "load",
    "delete",
]);

// Game types the Activity can start. Teams (needs a lobby) and competition
// (moderator-gated) are intentionally excluded.
export const ACTIVITY_GAME_TYPES: ReadonlySet<string> = new Set([
    GameType.CLASSIC,
    GameType.SUDDEN_DEATH,
    GameType.ELIMINATION,
    GameType.CLIP,
]);

// Numeric bounds for the Activity options panel. Kept in sync with the
// slash-command handlers (src/commands/game_options/{limit,timer,...}.ts);
// validated server-side so a malicious client can't persist out-of-range
// values.
const LIMIT_MIN = 0;
const LIMIT_MAX = 100_000;
const GOAL_MIN = 1;
const GOAL_MAX = 100_000;
const TIMER_MIN = 2;
const TIMER_MAX = 180;
const DURATION_MIN = 2;
const DURATION_MAX = 600;
// Cap artist-list writes; the slash-command UX tops out at a similar
// size and anything larger is almost certainly abuse or a client bug.
const ARTIST_LIST_MAX = 200;

// Subset of ActivitySetOptionArgs that the client supplies — guildID /
// userID are filled in server-side from the auth context.
type SetOptionBody =
    | { kind: "gender"; genders: GenderModeOptions[] }
    | { kind: "guessMode"; guessMode: GuessModeType }
    | { kind: "multiguess"; multiguess: MultiGuessType }
    | { kind: "limit"; limitStart: number; limitEnd: number }
    | { kind: "cutoff"; beginningYear: number; endYear: number }
    | { kind: "goal"; goal: number | null }
    | { kind: "timer"; timer: number | null }
    | { kind: "advanced"; setting: AdvancedCommandAction; value: number }
    | { kind: "duration"; duration: number | null }
    | { kind: "shuffle"; shuffle: ShuffleType }
    | { kind: "seek"; seek: SeekType }
    | { kind: "language"; language: LanguageType }
    | { kind: "release"; release: ReleaseType }
    | { kind: "artisttype"; artisttype: ArtistType }
    | { kind: "subunits"; subunits: SubunitsPreference }
    | { kind: "answer"; answer: AnswerType }
    | { kind: "ost"; ost: OstPreference }
    | { kind: "special"; special: SpecialType | null }
    | { kind: "groups"; artistIDs: number[] }
    | { kind: "includes"; artistIDs: number[] }
    | { kind: "excludes"; artistIDs: number[] }
    | { kind: "playlist"; playlistURL: string | null }
    | { kind: "reset" };

/**
 * @param v - the raw client value
 * @param min - inclusive lower bound
 * @param max - inclusive upper bound
 * @returns v if it's an integer within [min, max], otherwise null
 */
export function intInRange(
    v: unknown,
    min: number,
    max: number,
): number | null {
    if (typeof v !== "number" || !Number.isInteger(v)) return null;
    if (v < min || v > max) return null;
    return v;
}

/**
 * @param v - the raw client value
 * @param min - inclusive lower bound
 * @param max - inclusive upper bound
 * @returns null for an explicit null, v if it's an integer within
 * [min, max], or undefined if it's invalid
 */
function nullableIntInRange(
    v: unknown,
    min: number,
    max: number,
): number | null | undefined {
    // null explicitly clears the option; a present-but-invalid value (wrong
    // type or out of range) is signalled as `undefined` so the caller rejects
    // it with a 400 rather than silently coercing it to a reset.
    if (v === null) return null;
    const parsed = intInRange(v, min, max);
    return parsed === null ? undefined : parsed;
}

/**
 * @param v - the raw client value
 * @param min - inclusive lower bound
 * @param max - inclusive upper bound
 * @returns v if it's a finite number within [min, max], otherwise null
 */
export function floatInRange(
    v: unknown,
    min: number,
    max: number,
): number | null {
    if (typeof v !== "number" || !Number.isFinite(v)) return null;
    if (v < min || v > max) return null;
    return v;
}

/**
 * Parses + whitelists the JSON body of POST /api/activity/option. Never
 * trust the client: only accept `kind` + the typed value for that kind,
 * and reject everything else.
 * @param body - Raw JSON body supplied by the request.
 * @returns A validated SetOptionBody, or null if the shape/enum mismatch
 * means the caller should respond 400.
 */
export function parseSetOptionBody(body: unknown): SetOptionBody | null {
    if (!body || typeof body !== "object") return null;
    const obj = body as Record<string, unknown>;
    switch (obj["kind"]) {
        case "gender": {
            const raw = obj["genders"];
            if (!Array.isArray(raw)) return null;
            if (raw.length > 4) return null;
            const genders: GenderModeOptions[] = [];
            for (const g of raw) {
                if (typeof g !== "string" || !GENDER_VALUES.has(g)) {
                    return null;
                }

                genders.push(g as GenderModeOptions);
            }

            return { kind: "gender", genders };
        }

        case "guessMode": {
            const v = obj["guessMode"];
            if (typeof v !== "string" || !GUESS_MODE_VALUES.has(v)) {
                return null;
            }

            return { kind: "guessMode", guessMode: v as GuessModeType };
        }

        case "multiguess": {
            const v = obj["multiguess"];
            if (typeof v !== "string" || !MULTIGUESS_VALUES.has(v)) {
                return null;
            }

            return { kind: "multiguess", multiguess: v as MultiGuessType };
        }

        case "limit": {
            const start = intInRange(obj["limitStart"], LIMIT_MIN, LIMIT_MAX);
            const end = intInRange(obj["limitEnd"], LIMIT_MIN, LIMIT_MAX);
            if (start === null || end === null) return null;
            if (start >= end) return null;
            return { kind: "limit", limitStart: start, limitEnd: end };
        }

        case "cutoff": {
            const now = new Date().getFullYear();
            const begin = intInRange(
                obj["beginningYear"],
                EARLIEST_BEGINNING_SEARCH_YEAR,
                now,
            );

            const end = intInRange(
                obj["endYear"],
                EARLIEST_BEGINNING_SEARCH_YEAR,
                now,
            );

            if (begin === null || end === null) return null;
            if (begin > end) return null;
            return { kind: "cutoff", beginningYear: begin, endYear: end };
        }

        case "goal": {
            const v = nullableIntInRange(obj["goal"], GOAL_MIN, GOAL_MAX);
            if (v === undefined) return null;
            return { kind: "goal", goal: v };
        }

        case "timer": {
            const v = nullableIntInRange(obj["timer"], TIMER_MIN, TIMER_MAX);
            if (v === undefined) return null;
            return { kind: "timer", timer: v };
        }

        case "duration": {
            const v = nullableIntInRange(
                obj["duration"],
                DURATION_MIN,
                DURATION_MAX,
            );

            if (v === undefined) return null;
            return { kind: "duration", duration: v };
        }

        case "shuffle": {
            const v = obj["shuffle"];
            if (typeof v !== "string" || !SHUFFLE_VALUES.has(v)) {
                return null;
            }

            return { kind: "shuffle", shuffle: v as ShuffleType };
        }

        case "seek": {
            const v = obj["seek"];
            if (typeof v !== "string" || !SEEK_VALUES.has(v)) {
                return null;
            }

            return { kind: "seek", seek: v as SeekType };
        }

        case "language": {
            const v = obj["language"];
            if (typeof v !== "string" || !LANGUAGE_VALUES.has(v)) {
                return null;
            }

            return { kind: "language", language: v as LanguageType };
        }

        case "release": {
            const v = obj["release"];
            if (typeof v !== "string" || !RELEASE_VALUES.has(v)) {
                return null;
            }

            return { kind: "release", release: v as ReleaseType };
        }

        case "artisttype": {
            const v = obj["artisttype"];
            if (typeof v !== "string" || !ARTIST_TYPE_VALUES.has(v)) {
                return null;
            }

            return { kind: "artisttype", artisttype: v as ArtistType };
        }

        case "subunits": {
            const v = obj["subunits"];
            if (typeof v !== "string" || !SUBUNITS_VALUES.has(v)) {
                return null;
            }

            return { kind: "subunits", subunits: v as SubunitsPreference };
        }

        case "answer": {
            const v = obj["answer"];
            if (typeof v !== "string" || !ANSWER_TYPE_VALUES.has(v)) {
                return null;
            }

            return { kind: "answer", answer: v as AnswerType };
        }

        case "ost": {
            const v = obj["ost"];
            if (typeof v !== "string" || !OST_VALUES.has(v)) {
                return null;
            }

            return { kind: "ost", ost: v as OstPreference };
        }

        case "advanced": {
            const setting = obj["setting"];
            if (
                typeof setting !== "string" ||
                !ADVANCED_SETTING_VALUES.has(setting)
            ) {
                return null;
            }

            const value = floatInRange(
                obj["value"],
                0,
                ADVANCED_SETTING_MAX_DELAY_SEC,
            );

            if (value === null) return null;
            return {
                kind: "advanced",
                setting: setting as AdvancedCommandAction,
                value,
            };
        }

        case "special": {
            const v = obj["special"];
            // null is a valid value: it clears the audio modifier.
            if (
                v !== null &&
                (typeof v !== "string" || !SPECIAL_VALUES.has(v))
            ) {
                return null;
            }

            return { kind: "special", special: v as SpecialType | null };
        }

        case "groups":
        case "includes":
        case "excludes": {
            const raw = obj["artistIDs"];
            if (!Array.isArray(raw)) return null;
            if (raw.length > ARTIST_LIST_MAX) return null;
            const artistIDs: number[] = [];
            for (const id of raw) {
                if (
                    typeof id !== "number" ||
                    !Number.isInteger(id) ||
                    id <= 0
                ) {
                    return null;
                }

                artistIDs.push(id);
            }

            return {
                kind: obj["kind"] as "groups" | "includes" | "excludes",
                artistIDs,
            };
        }

        case "playlist": {
            const v = obj["playlistURL"];
            if (v === null) return { kind: "playlist", playlistURL: null };
            // Cap length defensively; the worker validates the URL shape.
            if (typeof v !== "string" || v.length > 2048) return null;
            return { kind: "playlist", playlistURL: v };
        }

        case "reset":
            return { kind: "reset" };

        default:
            return null;
    }
}
