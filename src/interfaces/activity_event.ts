import type { ActivityMultipleChoiceOption } from "./activity_round_meta";
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
          songCounter: { uniqueSongsPlayed: number; totalSongs: number };
      }
    | { type: "scoreboardUpdate"; scoreboard: ActivityScoreboardSnapshot }
    | {
          // Pushed when multiple-choice options are (re)generated for the
          // current round — at round start in MC mode, or when answerType is
          // switched to MC mid-round. roundIndex lets a stale client ignore
          // choices for a round it has already moved past.
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
          // Pushed once at session end with the standout stats, for the recap
          // card on the game-over screen. Names resolved server-side.
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
          // Broadcast to every viewer when a player flings an emote, for a
          // transient floating-emote animation. Not persisted.
          type: "emote";
          userID: string;
          username: string;
          avatarUrl: string | null;
          emote: string;
      }
    | {
          type: "levelUp";
          levelUps: Array<{
              userID: string;
              username: string;
              startLevel: number;
              endLevel: number;
              rank: string;
              isRankUp: boolean;
          }>;
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
      }
    | {
          // Web sessions only: the playback spec for the round's audio.
          // Worker → admiral ONLY: the hub must intercept this (it names the
          // song) and mint an opaque streaming URL instead of forwarding.
          type: "roundAudio";
          youtubeLink: string;
          songLocation: string;
          seekLocation: number;
          songDuration: number;
          inputArgs: string[];
          encoderArgs: string[];
          playbackDurationSec: number;
          songStartedAt: number | null;
      };

export default ActivityEvent;
