import { AnswerType } from "../commands/game_options/answer";
import { ArtistType } from "../commands/game_options/artisttype";
import { Gender } from "../commands/game_options/gender";
import { GuessModeType } from "../commands/game_options/guessmode";
import { LanguageType } from "../commands/game_options/language";
import { MultiGuessType } from "../commands/game_options/multiguess";
import { OstPreference } from "../commands/game_options/ost";
import { ReleaseType } from "../commands/game_options/release";
import { SeekType } from "../commands/game_options/seek";
import { ShuffleType } from "../commands/game_options/shuffle";
import { SpecialType } from "../commands/game_options/special";
import { SubunitsPreference } from "../commands/game_options/subunits";
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
