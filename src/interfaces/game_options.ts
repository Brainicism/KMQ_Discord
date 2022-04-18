import { AnswerType } from "../enums/option_types/answer_type";
import { ArtistType } from "../enums/option_types/artist_type";
import { Gender } from "../enums/option_types/gender";
import { GuessModeType } from "../enums/option_types/guess_mode_type";
import { LanguageType } from "../enums/option_types/language_type";
import { MultiGuessType } from "../enums/option_types/multiguess_type";
import { OstPreference } from "../enums/option_types/ost_preference";
import { ReleaseType } from "../enums/option_types/release_type";
import { SeekType } from "../enums/option_types/seek_type";
import { ShuffleType } from "../enums/option_types/shuffle_type";
import { SpecialType } from "../enums/option_types/special_type";
import { SubunitsPreference } from "../enums/option_types/subunit_preference";
import MatchedArtist from "./matched_artist";

export default interface GameOptions {
    beginningYear: number;
    endYear: number;
    gender: Array<Gender>;
    limitStart: number;
    limitEnd: number;
    seekType: SeekType;
    specialType: SpecialType;
    guessModeType: GuessModeType;
    releaseType: ReleaseType;
    artistType: ArtistType;
    answerType: AnswerType;
    shuffleType: ShuffleType;
    groups: MatchedArtist[];
    excludes: MatchedArtist[];
    includes: MatchedArtist[];
    goal: number;
    guessTimeout: number;
    duration: number;
    languageType: LanguageType;
    multiGuessType: MultiGuessType;
    subunitPreference: SubunitsPreference;
    ostPreference: OstPreference;
    forcePlaySongID: string;
}
