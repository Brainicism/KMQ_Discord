/* eslint-disable no-return-assign */
import AnswerType from "./enums/option_types/answer_type";
import ArtistType from "./enums/option_types/artist_type";
import ExpBonusModifier from "./enums/exp_bonus_modifier";
import GameOption from "./enums/game_option_name";
import Gender from "./enums/option_types/gender";
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

export const DEFAULT_BEGINNING_SEARCH_YEAR = 1990;
export const DEFAULT_ENDING_SEARCH_YEAR = new Date().getFullYear();
export const DEFAULT_GUESS_MODE = GuessModeType.SONG_NAME;
export const DEFAULT_ARTIST_TYPE = ArtistType.BOTH;
export const DEFAULT_LANGUAGE = LanguageType.ALL;
export const DEFAULT_SUBUNIT_PREFERENCE = SubunitsPreference.INCLUDE;
export const DEFAULT_OST_PREFERENCE = OstPreference.EXCLUDE;
export const DEFAULT_RELEASE_TYPE = ReleaseType.ALL;
export const DEFAULT_MULTIGUESS_TYPE = MultiGuessType.ON;
export const DEFAULT_ANSWER_TYPE = AnswerType.TYPING;
export const DEFAULT_SHUFFLE = ShuffleType.RANDOM;
export const DEFAULT_SEEK = SeekType.RANDOM;
export const DEFAULT_GENDER = [Gender.FEMALE, Gender.MALE, Gender.COED];
export const DEFAULT_LIMIT = 500;
export const SONG_START_DELAY = 3000;

export const specialFfmpegArgs = {
    [SpecialType.REVERSE]: (seek: number) => ({
        inputArgs: [],
        encoderArgs: ["-af", `atrim=end=${seek},areverse`],
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
    )(0)
);

export const VOTE_BONUS_DURATION = 1;
export const VOTE_LINK = "https://top.gg/bot/508759831755096074/vote";
export const REVIEW_LINK = "https://top.gg/bot/508759831755096074#reviews";
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
};

export const LEADERBOARD_ENTRIES_PER_PAGE = 10;

export const BOOKMARK_COMMAND_NAME = "Bookmark Song";
export const PROFILE_COMMAND_NAME = "Profile";

export const EMBED_ERROR_COLOR = 0xed4245; // Red
export const EMBED_SUCCESS_COLOR = 0x57f287; // Green
export const EMBED_SUCCESS_BONUS_COLOR = 0xfee75c; // Gold

export const PATREON_SUPPORTER_BADGE_ID = 23;

export const DATABASE_DOWNLOAD_DIR = path.join(
    __dirname,
    "../sql_dumps/daisuki"
);

export const ELIMINATION_DEFAULT_LIVES = 10;

export const enum GameOptionInternal {
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
}

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
};

export const ROUND_MAX_RUNNERS_UP = 30;
export const ROUND_MAX_SCOREBOARD_PLAYERS = 30;
export const SCOREBOARD_FIELD_CUTOFF = 6;

export const EMBED_FIELDS_PER_PAGE = 20;

export const LAST_PLAYED_SONG_QUEUE_SIZE = 10;
export const SELECTION_WEIGHT_VALUES_HARD = [1, 2, 4, 8, 16];
export const SELECTION_WEIGHT_VALUES_EASY = [
    ...SELECTION_WEIGHT_VALUES_HARD,
].reverse();
