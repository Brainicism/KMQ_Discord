import type ActivityCorrectGuesser from "./activity_correct_guesser";
import type ActivityRoundGuess from "./activity_round_guess";
import type ActivityRoundMeta from "./activity_round_meta";
import type ActivityRoundReveal from "./activity_round_reveal";
import type ActivityScoreboardSnapshot from "./activity_scoreboard_snapshot";
import type ActivitySessionMeta from "./activity_session_meta";
import type HintState from "./hint_state";
import type RecentGuess from "./recent_guess";
import type SkipState from "./skip_state";

export default interface UiState {
    session: ActivitySessionMeta | null;
    scoreboard: ActivityScoreboardSnapshot | null;
    currentRound: ActivityRoundMeta | null;
    lastReveal: {
        song: ActivityRoundReveal;
        correctGuessers: ActivityCorrectGuesser[];
        allGuesses: ActivityRoundGuess[];
    } | null;
    recentGuesses: RecentGuess[];
    sessionEnded: boolean;
    hint: HintState;
    skip: SkipState;
    bookmarkedLinks: Set<string>;
    /** True after a successful bookmark in the current round (before reveal). */
    currentRoundBookmarked: boolean;
}
