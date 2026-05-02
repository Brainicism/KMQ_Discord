import type ActivityCorrectGuesser from "./activity_correct_guesser";
import type ActivityOptionsSnapshot from "./activity_options_snapshot";
import type ActivityRoundGuess from "./activity_round_guess";
import type ActivityRoundMeta from "./activity_round_meta";
import type ActivityRoundReveal from "./activity_round_reveal";
import type ActivityScoreboardSnapshot from "./activity_scoreboard_snapshot";
import type ActivitySessionMeta from "./activity_session_meta";

type ActivityEvent =
    | { type: "sessionStart"; session: ActivitySessionMeta }
    | { type: "roundStart"; round: ActivityRoundMeta }
    | {
          type: "roundEnd";
          song: ActivityRoundReveal;
          correctGuessers: ActivityCorrectGuesser[];
          allGuesses: ActivityRoundGuess[];
          isCorrectGuess: boolean;
          scoreboard: ActivityScoreboardSnapshot;
      }
    | { type: "scoreboardUpdate"; scoreboard: ActivityScoreboardSnapshot }
    | {
          type: "guessReceived";
          userID: string;
          username: string;
          avatarUrl: string | null;
          isCorrect: boolean;
          ts: number;
      }
    | { type: "sessionEnd"; reason: string }
    | { type: "hintProgress"; requesters: number; threshold: number }
    | { type: "hintRevealed"; text: string }
    | { type: "skipProgress"; requesters: number; threshold: number }
    | { type: "skipped" }
    | { type: "optionsChanged"; options: ActivityOptionsSnapshot };

export default ActivityEvent;
