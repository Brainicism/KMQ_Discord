import type ActivityCorrectGuesser from "./activity_correct_guesser";
import type ActivityOptionsSnapshot from "./activity_options_snapshot";
import type ActivityRoundGuess from "./activity_round_guess";
import type ActivityRoundMeta from "./activity_round_meta";
import type { ActivityMultipleChoiceOption } from "./activity_round_meta";
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
          songCounter: { uniqueSongsPlayed: number; totalSongs: number };
      }
    | { type: "scoreboardUpdate"; scoreboard: ActivityScoreboardSnapshot }
    | {
          type: "roundChoices";
          roundIndex: number;
          choices: ActivityMultipleChoiceOption[];
      }
    | {
          type: "guessReceived";
          userID: string;
          username: string;
          avatarUrl: string | null;
          isCorrect: boolean;
          ts: number;
      }
    | { type: "sessionEnd"; reason: string }
    | {
          type: "recap";
          mvp: { userID: string; username: string; score: number } | null;
          fastestGuess: {
              userID: string;
              username: string;
              timeMs: number;
          } | null;
          longestStreak: {
              userID: string;
              username: string;
              streak: number;
          } | null;
          totalCorrect: number;
          totalRounds: number;
      }
    | {
          type: "emote";
          userID: string;
          username: string;
          avatarUrl: string | null;
          emote: string;
      }
    | { type: "hintProgress"; requesters: number; threshold: number }
    | { type: "hintRevealed"; text: string }
    | { type: "skipProgress"; requesters: number; threshold: number }
    | { type: "skipped" }
    | { type: "optionsChanged"; options: ActivityOptionsSnapshot }
    | {
          type: "roundTimerChanged";
          guessTimeoutSec: number | null;
          timerStartedAt: number;
      };

export default ActivityEvent;
