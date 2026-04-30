import type GameType from "../enums/game_type";

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
    gameType: GameType;
    roundsPlayed: number;
    correctGuesses: number;
    ownerID: string;
}

// eslint-disable-next-line import/no-unused-modules
export interface ActivityRoundMeta {
    roundIndex: number;
    songStartedAt: number;
    guessTimeoutSec: number | null;
}

// eslint-disable-next-line import/no-unused-modules
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

// eslint-disable-next-line import/no-unused-modules
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

export type ActivityRequestOp =
    | "snapshot"
    | "guess"
    | "startGame"
    | "skipVote"
    | "endGame"
    | "hint"
    | "bookmark";

export interface ActivitySnapshotArgs {
    guildID: string;
}

export interface ActivityGuessArgs {
    guildID: string;
    userID: string;
    guess: string;
    ts: number;
}

export interface ActivityStartGameArgs {
    guildID: string;
    userID: string;
    voiceChannelID: string;
    textChannelID: string;
}

export interface ActivityUserActionArgs {
    guildID: string;
    userID: string;
}

export interface ActivityBookmarkArgs {
    guildID: string;
    userID: string;
    /** Optional — if omitted, the worker bookmarks the current round's song. */
    youtubeLink?: string;
}

export interface ActivityBookmarkResponse {
    ok: boolean;
    reason?: ActivityRequestRejection;
    songName?: string;
    artistName?: string;
    /** Always returned on success so the client can update its local set. */
    youtubeLink?: string;
}

// eslint-disable-next-line import/no-unused-modules
export type ActivityRequestRejection =
    | "no_session"
    | "maintenance"
    | "banned"
    | "rate_limit"
    | "not_in_vc"
    | "internal"
    | "session_already_running"
    | "no_round"
    | "hint_unavailable"
    | "song_not_found";

export interface ActivityGuessResponse {
    ok: boolean;
    reason?: ActivityRequestRejection;
}

export interface ActivityRequestMessage {
    cid: string;
    op: ActivityRequestOp;
    args:
        | ActivitySnapshotArgs
        | ActivityGuessArgs
        | ActivityStartGameArgs
        | ActivityUserActionArgs
        | ActivityBookmarkArgs;
}

export interface ActivityReplyMessage {
    cid: string;
    payload?: unknown;
    error?: string;
}

export interface ActivityWorkerEventMessage {
    guildID: string;
    event: ActivityEvent;
}

export const ACTIVITY_IPC_EVENT = "activity:event" as const;
export const ACTIVITY_IPC_REQUEST = "activity:request" as const;
export const ACTIVITY_IPC_REPLY = "activity:reply" as const;
