// Mirror of src/structures/activity_types.ts (server-side). Kept in lockstep
// manually for now; a follow-up phase can wire this through Vite's @shared
// alias once tsconfig project references are set up.

export interface ActivityScoreboardPlayer {
    id: string;
    username: string;
    avatarUrl: string | null;
    score: number;
    expGain: number;
    inVC: boolean;
}

export interface ActivityScoreboardSnapshot {
    players: ActivityScoreboardPlayer[];
    winnerIDs: string[];
    highestScore: number;
}

export interface ActivitySessionMeta {
    guildID: string;
    voiceChannelID: string;
    textChannelID: string;
    startedAt: number;
    gameType: number;
    roundsPlayed: number;
    correctGuesses: number;
    ownerID: string;
}

export interface ActivityRoundMeta {
    roundIndex: number;
    songStartedAt: number;
    guessTimeoutSec: number | null;
}

export interface ActivityRoundReveal {
    songName: string;
    artistName: string;
    youtubeLink: string;
    publishYear: number;
    thumbnailUrl: string;
}

export interface ActivityCorrectGuesser {
    id: string;
    username: string;
    avatarUrl: string | null;
    pointsEarned: number;
    expGain: number;
}

export interface ActivityRoundGuess {
    userID: string;
    username: string;
    avatarUrl: string | null;
    guess: string;
    isCorrect: boolean;
    ts: number;
}

export type ActivityEvent =
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
          isCorrect: boolean;
          ts: number;
      }
    | { type: "sessionEnd"; reason: string }
    | { type: "hintProgress"; requesters: number; threshold: number }
    | { type: "hintRevealed"; text: string }
    | { type: "skipProgress"; requesters: number; threshold: number }
    | { type: "skipped" };

export interface ActivitySnapshot {
    hasSession: boolean;
    session?: ActivitySessionMeta;
    scoreboard?: ActivityScoreboardSnapshot;
    currentRound?: ActivityRoundMeta;
}
