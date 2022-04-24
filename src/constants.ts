import { LocaleType } from "./enums/locale_type";
import { AnswerType } from "./enums/option_types/answer_type";
import { ArtistType } from "./enums/option_types/artist_type";
import { Gender } from "./enums/option_types/gender";
import { GuessModeType } from "./enums/option_types/guess_mode_type";
import { LanguageType } from "./enums/option_types/language_type";
import { MultiGuessType } from "./enums/option_types/multiguess_type";
import { OstPreference } from "./enums/option_types/ost_preference";
import { ReleaseType } from "./enums/option_types/release_type";
import { SeekType } from "./enums/option_types/seek_type";
import { ShuffleType } from "./enums/option_types/shuffle_type";
import { SpecialType } from "./enums/option_types/special_type";
import { SubunitsPreference } from "./enums/option_types/subunit_preference";

// eslint-disable-next-line import/prefer-default-export
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
export const DEFAULT_RELEASE_TYPE = ReleaseType.OFFICIAL;
export const DEFAULT_MULTIGUESS_TYPE = MultiGuessType.ON;
export const DEFAULT_ANSWER_TYPE = AnswerType.TYPING;
export const DEFAULT_SHUFFLE = ShuffleType.RANDOM;
export const DEFAULT_SEEK = SeekType.RANDOM;
export const DEFAULT_GENDER = [Gender.FEMALE, Gender.MALE, Gender.COED];
export const DEFAULT_LIMIT = 500;
export const SONG_START_DELAY = 3000;

export const specialFfmpegArgs = {
    [SpecialType.REVERSE]: (seek: number) => ({
        inputArgs: ["-ss", seek.toString()],
        encoderArgs: ["-af", "areverse"],
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
