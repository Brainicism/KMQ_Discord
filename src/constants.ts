/* eslint-disable no-return-assign */
import AdvancedCommandAction from "./enums/advanced_setting_action_name";
import AnswerType from "./enums/option_types/answer_type";
import ArtistType from "./enums/option_types/artist_type";
import ExpBonusModifier from "./enums/exp_bonus_modifier";
import GameOption from "./enums/game_option_name";
import GuessModeType from "./enums/option_types/guess_mode_type";
import LanguageType from "./enums/option_types/language_type";
import LocaleType from "./enums/locale_type";
import MultiGuessType from "./enums/option_types/multiguess_type";
import OstPreference from "./enums/option_types/ost_preference";
import ReleaseType from "./enums/option_types/release_type";
import SeekType from "./enums/option_types/seek_type";
import ShuffleType from "./enums/option_types/shuffle_type";
import SpecialType from "./enums/option_types/special_type";
import SubunitsPreference from "./enums/option_types/subunit_preference";
import path from "path";
import type { GenderModeOptions } from "./enums/option_types/gender";

export class KmqImages {
    public static READING_BOOK =
        "https://kmq.kpop.gg/static/thumbnails/book_bg.png";

    public static NOT_IMPRESSED =
        "https://kmq.kpop.gg/static/thumbnails/not_impressed_bg.png";

    public static HAPPY = "https://kmq.kpop.gg/static/thumbnails/happy_bg.png";

    public static DEAD = "https://kmq.kpop.gg/static/thumbnails/dead_bg.png";

    public static LISTENING =
        "https://kmq.kpop.gg/static/thumbnails/listening_bg.png";

    public static THUMBS_UP =
        "https://kmq.kpop.gg/static/thumbnails/thumbs_up_bg.png";
}

export const GROUP_LIST_URL = "https://kmq.kpop.gg/groups";

export const EARLIEST_BEGINNING_SEARCH_YEAR = 1900;
export const DEFAULT_ENDING_SEARCH_YEAR = new Date().getFullYear();
export const DEFAULT_BEGINNING_SEARCH_YEAR = DEFAULT_ENDING_SEARCH_YEAR - 15;
export const DEFAULT_GUESS_MODE = GuessModeType.SONG_NAME;
export const DEFAULT_ARTIST_TYPE = ArtistType.BOTH;
export const DEFAULT_LANGUAGE = LanguageType.ALL;
export const DEFAULT_SUBUNIT_PREFERENCE = SubunitsPreference.INCLUDE;
export const DEFAULT_OST_PREFERENCE = OstPreference.EXCLUDE;
export const DEFAULT_RELEASE_TYPE = ReleaseType.ALL;
export const DEFAULT_MULTIGUESS_TYPE = MultiGuessType.ON;
export const DEFAULT_ANSWER_TYPE = AnswerType.MULTIPLE_CHOICE_MED;
export const DEFAULT_SHUFFLE = ShuffleType.RANDOM;
export const DEFAULT_SEEK = SeekType.RANDOM;
export const DEFAULT_GENDER: Array<GenderModeOptions> = [
    "female",
    "male",
    "coed",
];
export const DEFAULT_LIMIT = 500;

export const DEFAULT_ADVANCED_SETTINGS = {
    [AdvancedCommandAction.MULTIGUESS_DELAY]: 1.5,
    [AdvancedCommandAction.SONG_START_DELAY]: 3,
};

export const KMQ_USER_AGENT = "KMQ (K-pop Music Quiz)";
export const specialFfmpegArgs = {
    [SpecialType.REVERSE]: (seek: number, duration: number) => ({
        inputArgs: [],
        encoderArgs: ["-af", `atrim=end=${duration - seek},areverse`],
    }),
    [SpecialType.SLOW]: (seek: number) => ({
        inputArgs: ["-ss", seek.toString()],
        encoderArgs: ["-af", "rubberband=tempo=0.5"],
    }),
    [SpecialType.FAST]: (seek: number) => ({
        inputArgs: ["-ss", seek.toString()],
        encoderArgs: ["-af", "rubberband=tempo=1.5"],
    }),
    [SpecialType.FASTER]: (seek: number) => ({
        inputArgs: ["-ss", seek.toString()],
        encoderArgs: ["-af", "rubberband=tempo=2"],
    }),
    [SpecialType.LOW_PITCH]: (seek: number) => ({
        // 3 semitones lower
        inputArgs: ["-ss", seek.toString()],
        encoderArgs: ["-af", "rubberband=pitch=0.840896"],
    }),
    [SpecialType.HIGH_PITCH]: (seek: number) => ({
        // 4 semitones higher
        inputArgs: ["-ss", seek.toString()],
        encoderArgs: ["-af", "rubberband=pitch=1.25992"],
    }),
    [SpecialType.NIGHTCORE]: (seek: number) => ({
        inputArgs: ["-ss", seek.toString()],
        encoderArgs: ["-af", "rubberband=pitch=1.25992:tempo=1.25"],
    }),
};

// z = chinese, j = japanese, e = english, s = spanish
export const FOREIGN_LANGUAGE_TAGS = ["z", "j", "e", "s"];
export const NON_OFFICIAL_VIDEO_TAGS = ["c", "d", "a", "r", "v", "x", "p"];
export const DEFAULT_LOCALE = LocaleType.EN;

const EXP_TABLE = [...Array(1000).keys()].map((level) => {
    if (level === 0 || level === 1) return 0;
    return 10 * level ** 2 + 200 * level - 200;
});

export const CUM_EXP_TABLE = EXP_TABLE.map(
    (
        (sum) => (value) =>
            (sum += value)
    )(0),
);

export const VOTE_BONUS_DURATION = 1;
export const VOTE_LINK = "https://top.gg/bot/508759831755096074/vote";
export const REVIEW_LINK =
    "https://top.gg/bot/508759831755096074#:~:text=118%2C151-,Ratings%20%26%20Reviews,-4.59";
export const VOTE_RESET_DURATION = 12;

export const PARTICIPANT_MODIFIER_MAX_PARTICIPANTS = 6;
export const GUESS_STREAK_THRESHOLD = 5;

export const ExpBonusModifierValues = {
    [ExpBonusModifier.POWER_HOUR]: 2,
    [ExpBonusModifier.BONUS_ARTIST]: 2,
    [ExpBonusModifier.VOTE]: 2,
    [ExpBonusModifier.GUESS_STREAK]: 1.2,
    [ExpBonusModifier.QUICK_GUESS]: 1.1,
    [ExpBonusModifier.MC_GUESS_EASY]: 0.25,
    [ExpBonusModifier.MC_GUESS_MEDIUM]: 0.5,
    [ExpBonusModifier.MC_GUESS_HARD]: 0.75,
    [ExpBonusModifier.SHUFFLE_POPULARITY]: 0.2,
    [ExpBonusModifier.SHUFFLE_WEIGHTED_EASY]: 0.5,
    [ExpBonusModifier.SHUFFLE_CHRONOLOGICAL]: 0.8,
    [ExpBonusModifier.ARTIST_GUESS]: 0.3,
    [ExpBonusModifier.ARTIST_GUESS_GROUPS_SELECTED]: 0,
    [ExpBonusModifier.RANDOM_GUESS_BONUS_COMMON]: 2,
    [ExpBonusModifier.RANDOM_GUESS_BONUS_RARE]: 5,
    [ExpBonusModifier.RANDOM_GUESS_BONUS_EPIC]: 10,
    [ExpBonusModifier.RANDOM_GUESS_BONUS_LEGENDARY]: 50,
    [ExpBonusModifier.BELOW_SONG_COUNT_THRESHOLD]: 0,
    [ExpBonusModifier.TYPO]: 0.8,
    [ExpBonusModifier.HINT_USED]: 0.5,
    [ExpBonusModifier.FIRST_GAME_OF_DAY]: 1.5,
    [ExpBonusModifier.HIDDEN]: 1.05,
};

export const LEADERBOARD_ENTRIES_PER_PAGE = 10;

export const BOOKMARK_COMMAND_NAME = "Bookmark Song";
export const PROFILE_COMMAND_NAME = "Profile";

export const EMBED_ERROR_COLOR = 0xed4245; // Red
export const EMBED_SUCCESS_COLOR = 0x57f287; // Green
export const EMBED_SUCCESS_BONUS_COLOR = 0xfee75c; // Gold

export const DATABASE_DOWNLOAD_DIR = path.join(
    __dirname,
    "../sql_dumps/daisuki",
);

export const ELIMINATION_DEFAULT_LIVES = 10;
export const ELIMINATION_MAX_LIVES = 10000;
export const ELIMINATION_MIN_LIVES = 1;

export const enum GameOptionInternal {
    ADVANCED_SETTINGS = "advancedSettings",
    BEGINNING_YEAR = "beginningYear",
    END_YEAR = "endYear",
    GENDER = "gender",
    LIMIT_START = "limitStart",
    LIMIT_END = "limitEnd",
    SEEK_TYPE = "seekType",
    SPECIAL_TYPE = "specialType",
    GUESS_MODE_TYPE = "guessModeType",
    RELEASE_TYPE = "releaseType",
    ARTIST_TYPE = "artistType",
    ANSWER_TYPE = "answerType",
    SHUFFLE_TYPE = "shuffleType",
    GROUPS = "groups",
    EXCLUDES = "excludes",
    INCLUDES = "includes",
    GOAL = "goal",
    GUESS_TIMEOUT = "guessTimeout",
    DURATION = "duration",
    LANGUAGE_TYPE = "languageType",
    MULTI_GUESS_TYPE = "multiGuessType",
    SUBUNIT_PREFERENCE = "subunitPreference",
    OST_PREFERENCE = "ostPreference",
    FORCE_PLAY_SONG = "forcePlaySongID",
    PLAYLIST_ID = "spotifyPlaylistID",
}

export const NON_RELOAD_IMPACTING_GAME_OPTION_INTERNALS: Array<GameOptionInternal> =
    [
        GameOptionInternal.ADVANCED_SETTINGS,
        GameOptionInternal.SEEK_TYPE,
        GameOptionInternal.SPECIAL_TYPE,
        GameOptionInternal.GUESS_MODE_TYPE,
        GameOptionInternal.ANSWER_TYPE,
        GameOptionInternal.SHUFFLE_TYPE,
        GameOptionInternal.GOAL,
        GameOptionInternal.GUESS_TIMEOUT,
        GameOptionInternal.DURATION,
        GameOptionInternal.MULTI_GUESS_TYPE,
    ];

export const GameOptionInternalToGameOption: { [option: string]: string } = {
    [GameOptionInternal.BEGINNING_YEAR]: GameOption.CUTOFF,
    [GameOptionInternal.END_YEAR]: GameOption.CUTOFF,
    [GameOptionInternal.GENDER]: GameOption.GENDER,
    [GameOptionInternal.LIMIT_START]: GameOption.LIMIT,
    [GameOptionInternal.LIMIT_END]: GameOption.LIMIT,
    [GameOptionInternal.SEEK_TYPE]: GameOption.SEEK_TYPE,
    [GameOptionInternal.SPECIAL_TYPE]: GameOption.SPECIAL_TYPE,
    [GameOptionInternal.GUESS_MODE_TYPE]: GameOption.GUESS_MODE_TYPE,
    [GameOptionInternal.RELEASE_TYPE]: GameOption.RELEASE_TYPE,
    [GameOptionInternal.ARTIST_TYPE]: GameOption.ARTIST_TYPE,
    [GameOptionInternal.ANSWER_TYPE]: GameOption.ANSWER_TYPE,
    [GameOptionInternal.SHUFFLE_TYPE]: GameOption.SHUFFLE_TYPE,
    [GameOptionInternal.GROUPS]: GameOption.GROUPS,
    [GameOptionInternal.EXCLUDES]: GameOption.EXCLUDE,
    [GameOptionInternal.INCLUDES]: GameOption.INCLUDE,
    [GameOptionInternal.GOAL]: GameOption.GOAL,
    [GameOptionInternal.GUESS_TIMEOUT]: GameOption.TIMER,
    [GameOptionInternal.DURATION]: GameOption.DURATION,
    [GameOptionInternal.LANGUAGE_TYPE]: GameOption.LANGUAGE_TYPE,
    [GameOptionInternal.MULTI_GUESS_TYPE]: GameOption.MULTIGUESS,
    [GameOptionInternal.SUBUNIT_PREFERENCE]: GameOption.SUBUNIT_PREFERENCE,
    [GameOptionInternal.OST_PREFERENCE]: GameOption.OST_PREFERENCE,
    [GameOptionInternal.FORCE_PLAY_SONG]: GameOption.FORCE_PLAY_SONG,
    [GameOptionInternal.PLAYLIST_ID]: GameOption.PLAYLIST_ID,
};

export const ROUND_MAX_RUNNERS_UP = 30;
export const ROUND_MAX_SCOREBOARD_PLAYERS = 30;
export const SCOREBOARD_FIELD_CUTOFF = 6;

export const EMBED_FIELDS_PER_PAGE = 20;
export const MAX_AUTOCOMPLETE_FIELDS = 25;

export const LAST_PLAYED_SONG_QUEUE_SIZE = 10;
export const SELECTION_WEIGHT_VALUES_HARD = [1, 2, 4, 8, 16];
export const SELECTION_WEIGHT_VALUES_EASY = [
    ...SELECTION_WEIGHT_VALUES_HARD,
].reverse();

export const EPHEMERAL_MESSAGE_FLAG = 64;

export const DataFiles = {
    PRIMARY_COOKIE: path.join(__dirname, "../data/primary"),
    NEWS: path.join(__dirname, "../data/news.md"),
    FROZEN_TABLE_SCHEMA: path.join(
        __dirname,
        "../data/frozen_table_schema.json",
    ),
    GROUP_LIST: path.join(__dirname, "../data/group_list.txt"),
    FEATURE_SWITCH_CONFIG: path.join(
        __dirname,
        "../data/feature_switch_config.json",
    ),
    CACHED_APP_CMD_IDS: path.join(__dirname, "../data/cached_app_cmd_ids.json"),
};

// ephermeral to the docker container, not mounted from host
export const STANDBY_COOKIE = path.join(__dirname, "../standby");
export const PROMOTED_COOKIE = path.join(__dirname, "../promoted");
export const STATUS_COOKIE = path.join(__dirname, "../status");

export const PERMISSIONS_LINK = "https://www.youtube.com/watch?v=87GW0SmF5LI";
export const SPOTIFY_BASE_URL = "https://open.spotify.com/playlist/";
export const SPOTIFY_SHORTHAND_BASE_URL = "https://spotify.link/";
export const YOUTUBE_PLAYLIST_BASE_URL =
    "https://www.youtube.com/playlist?list=";

export enum GroupAction {
    ADD = "add",
    REMOVE = "remove",
    SET = "set",
    RESET = "reset",
}

export enum OptionAction {
    SET = "set",
    RESET = "reset",
}

export const TEST_DB_CACHED_EXPORT = path.join(
    __dirname,
    "../sql_dumps/kmq-test-cached.sql",
);

export const IGNORED_WARNING_SUBSTRINGS = [
    "Unhandled MESSAGE_CREATE type",
    "Unknown guild text channel type",
];

export const SHADOW_BANNED_ARTIST_IDS = [1177, 170];

export const CORRECT_GUESS_EMOJI = "✅";
export const INCORRECT_GUESS_EMOJI = "❌";
export const HIDDEN_DEFAULT_TIMER = 15;
export const QUICK_GUESS_EMOJI = "⚡";

export const QUICK_GUESS_MS = 3500;
export const CHRONOLOGICAL_SHUFFLE_NUM_PARTITIONS = 7;
