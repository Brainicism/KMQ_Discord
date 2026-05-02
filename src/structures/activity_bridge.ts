// Cycle: game_session.ts imports attachActivityBridge from this module, and
// the command imports below transitively import game_session.ts. The cycle is
// runtime-safe because each side only references the other through function
// calls that happen after both modules finish loading.
/* eslint-disable import/no-cycle */
import {
    ACTIVITY_IPC_EVENT,
    ACTIVITY_IPC_REPLY,
    ACTIVITY_IPC_REQUEST,
    youtubeThumbnailUrl,
} from "../constants";
import { IPCLogger } from "../logger";
import {
    getCurrentVoiceMembers,
    getMajorityCount,
} from "../helpers/discord_utils";
import { onGuildPreferenceChanged } from "../helpers/guild_preference_events";
import EndCommand from "../commands/game_commands/end";
import GameOption from "../enums/game_option_name";
import GameType from "../enums/game_type";
import GuildPreference from "./guild_preference";
import HintCommand from "../commands/game_commands/hint";
import KmqConfiguration from "../kmq_configuration";
import KmqMember from "./kmq_member";
import MessageContext from "./message_context";
import PlayCommand from "../commands/game_commands/play";
import Session from "./session";
import SkipCommand from "../commands/game_commands/skip";
import SongSelector from "./song_selector";
import State from "../state";
import type ActivityBookmarkArgs from "../interfaces/activity_bookmark_args";
import type ActivityBookmarkResponse from "../interfaces/activity_bookmark_response";
import type ActivityCorrectGuesser from "../interfaces/activity_correct_guesser";
import type ActivityEvent from "../interfaces/activity_event";
import type ActivityGuessArgs from "../interfaces/activity_guess_args";
import type ActivityGuessResponse from "../interfaces/activity_guess_response";
import type ActivityOptionsSnapshot from "../interfaces/activity_options_snapshot";
import type ActivityRequestMessage from "../interfaces/activity_request_message";
import type ActivityScoreboardPlayer from "../interfaces/activity_scoreboard_player";
import type ActivityScoreboardSnapshot from "../interfaces/activity_scoreboard_snapshot";
import type ActivitySessionMeta from "../interfaces/activity_session_meta";
import type ActivitySetOptionArgs from "../interfaces/activity_set_option_args";
import type ActivitySnapshot from "../interfaces/activity_snapshot";
import type ActivitySnapshotArgs from "../interfaces/activity_snapshot_args";
import type ActivityStartGameArgs from "../interfaces/activity_start_game_args";
import type ActivityUserActionArgs from "../interfaces/activity_user_action_args";
import type GameSession from "./game_session";
import type Player from "./player";
import type PlayerRoundResult from "../interfaces/player_round_result";
import type QueriedSong from "./queried_song";
import type Scoreboard from "./scoreboard";

const logger = new IPCLogger("activity_bridge");

let workerHandlerRegistered = false;

function snapshotPlayer(player: Player): ActivityScoreboardPlayer {
    return {
        id: player.id,
        username: player.username,
        avatarUrl: player.getAvatarURL() || null,
        score: player.getScore(),
        expGain: player.getExpGain(),
        inVC: player.inVC,
    };
}

function snapshotScoreboard(
    scoreboard: Scoreboard,
): ActivityScoreboardSnapshot {
    const players = scoreboard.getPlayers().map(snapshotPlayer);
    const winners = scoreboard.getWinners();
    return {
        players,
        winnerIDs: winners.map((p) => p.id),
        highestScore: winners[0]?.getScore() ?? 0,
    };
}

function snapshotSong(song: QueriedSong): {
    songName: string;
    artistName: string;
    youtubeLink: string;
    publishYear: number;
    thumbnailUrl: string;
} {
    return {
        songName: song.songName,
        artistName: song.artistName,
        youtubeLink: song.youtubeLink,
        publishYear: song.publishDate.getFullYear(),
        thumbnailUrl: youtubeThumbnailUrl(song.youtubeLink),
    };
}

function snapshotSessionMeta(session: GameSession): ActivitySessionMeta {
    return {
        guildID: session.guildID,
        voiceChannelID: session.voiceChannelID,
        textChannelID: session.textChannelID,
        startedAt: session.startedAt,
        gameType: session.gameType,
        roundsPlayed: session.getRoundsPlayed(),
        correctGuesses: session.getCorrectGuesses(),
        ownerID: session.owner.id,
    };
}

function snapshotOptions(
    guildPreference: GuildPreference,
): ActivityOptionsSnapshot {
    return {
        gender: [...guildPreference.gameOptions.gender],
        guessMode: guildPreference.gameOptions.guessModeType,
        multiguess: guildPreference.gameOptions.multiGuessType,
    };
}

function buildSessionSnapshot(
    session: GameSession,
    guildPreference: GuildPreference,
): ActivitySnapshot {
    const round = session.round;
    return {
        hasSession: true,
        session: snapshotSessionMeta(session),
        scoreboard: snapshotScoreboard(session.scoreboard),
        options: snapshotOptions(guildPreference),
        currentRound:
            round && round.songStartedAt !== null
                ? {
                      roundIndex: session.getRoundsPlayed(),
                      songStartedAt: round.songStartedAt,
                      guessTimeoutSec: session.getGuessTimeoutSec(),
                  }
                : undefined,
    };
}

/**
 * Per-guild FIFO lock. Mutating IPC ops (start/skip/end/hint/bookmark) for the
 * same guild are serialized so two concurrent requests can't both pass the
 * "session exists / no session" check before either has actually run.
 */
const guildLocks = new Map<string, Promise<unknown>>();

/**
 * @param guildID - the guild whose work to serialize
 * @param fn - the work to run inside the lock
 * @returns the work's result
 */
function withGuildLock<T>(guildID: string, fn: () => Promise<T>): Promise<T> {
    const prev = guildLocks.get(guildID) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    const tracked = next
        .catch(() => undefined)
        .finally(() => {
            if (guildLocks.get(guildID) === tracked) {
                guildLocks.delete(guildID);
            }
        });

    guildLocks.set(guildID, tracked);
    return next;
}

/**
 * Fire-and-forget wrapper around `withGuildLock` that logs unexpected escapes.
 * Each handler already replies inside its callback, so callers don't need to
 * await — they just need to make sure rejections aren't unhandled.
 * @param guildID - the guild whose work to serialize
 * @param fn - the work to run inside the lock
 */
function runLocked(guildID: string, fn: () => Promise<void>): void {
    withGuildLock(guildID, fn).catch((e) => {
        logger.error(
            `Unhandled error in activity guild lock. gid=${guildID}. err=${e}`,
        );
    });
}

function pushEvent(guildID: string, event: ActivityEvent): void {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!State.ipc) return;
    try {
        State.ipc.sendToAdmiral(ACTIVITY_IPC_EVENT, { guildID, event });
    } catch (e) {
        logger.warn(
            `Failed to forward activity event for gid: ${guildID}. type=${event.type}. err=${e}`,
        );
    }
}

async function broadcastOptionsChangedCore(guildID: string): Promise<void> {
    try {
        const guildPreference =
            await GuildPreference.getGuildPreference(guildID);

        pushEvent(guildID, {
            type: "optionsChanged",
            options: snapshotOptions(guildPreference),
        });
    } catch (e) {
        logger.warn(
            `Failed to broadcast optionsChanged for gid=${guildID}. err=${e}`,
        );
    }
}

/**
 * Fires a standalone optionsChanged wire event for the given guild. Fire-
 * and-forget by design — the GuildPreference write that triggered this has
 * already persisted, so any broadcast failure is just dropped with a log.
 * @param guildID - The guild whose options changed.
 */
function broadcastOptionsChanged(guildID: string): void {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    broadcastOptionsChangedCore(guildID);
}

async function handleSnapshotRequestCore(
    cid: string,
    guildID: string,
): Promise<void> {
    try {
        const guildPreference =
            await GuildPreference.getGuildPreference(guildID);

        const options = snapshotOptions(guildPreference);
        const session = Session.getSession(guildID);

        const payload: ActivitySnapshot =
            session && session.isGameSession()
                ? buildSessionSnapshot(session, guildPreference)
                : { hasSession: false, options };

        State.ipc.sendToAdmiral(ACTIVITY_IPC_REPLY, { cid, payload });
    } catch (e) {
        logger.warn(`snapshot op failed for gid=${guildID}. err=${e}`);
        State.ipc.sendToAdmiral(ACTIVITY_IPC_REPLY, {
            cid,
            error: "snapshot_failed",
        });
    }
}

/**
 * Dispatches the async body of the "snapshot" IPC op. Fire-and-forget; the
 * reply goes back through State.ipc inside the core.
 * @param cid - Correlation ID to tag the reply with.
 * @param guildID - Guild the snapshot is for.
 */
function handleSnapshotRequest(cid: string, guildID: string): void {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    handleSnapshotRequestCore(cid, guildID);
}

interface RoundStartPayload {
    roundIndex: number;
    songStartedAt: number;
    guessTimeoutSec: number | null;
}

interface RoundEndPayload {
    song: QueriedSong;
    correctGuessers: KmqMember[];
    playerRoundResults: PlayerRoundResult[];
    isCorrectGuess: boolean;
    guesses: Record<
        string,
        Array<{
            timeToGuessMs: number;
            guess: string;
            correct: boolean;
            pointsAwarded: number;
        }>
    >;
}

interface GuessReceivedPayload {
    userID: string;
    isCorrect: boolean;
    ts: number;
}

interface SessionEndPayload {
    reason: string;
}

/**
 * Registers a single worker-wide IPC listener for admiral→worker activity
 * requests. Idempotent: subsequent calls are a no-op. No-op when running
 * outside the eris-fleet worker (e.g. the test harness), where State.ipc
 * isn't populated.
 */
function ensureWorkerHandlerRegistered(): void {
    if (workerHandlerRegistered) {
        return;
    }

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!State.ipc) {
        return;
    }

    workerHandlerRegistered = true;

    // Any GuildPreference write (slash command or Activity IPC op) gets
    // broadcast to Activity sockets for that guild. Loading the preference
    // again is cheap — the setter's just persisted it, so the static cache
    // is warm.
    onGuildPreferenceChanged((guildID) => {
        broadcastOptionsChanged(guildID);
    });

    State.ipc.register(ACTIVITY_IPC_REQUEST, (msg: ActivityRequestMessage) => {
        const { cid, op, args } = msg;
        try {
            switch (op) {
                case "snapshot": {
                    const snapshotArgs = args as ActivitySnapshotArgs;
                    // Every snapshot reply carries the current options, so
                    // load GuildPreference upfront (hits the DB when not
                    // cached — intentional per Q2 of the Phase 4 plan so
                    // the Activity sees persisted state).
                    handleSnapshotRequest(cid, snapshotArgs.guildID);
                    return;
                }

                case "guess": {
                    const guessArgs = args as ActivityGuessArgs;
                    const reply = (payload: ActivityGuessResponse): void => {
                        State.ipc.sendToAdmiral(ACTIVITY_IPC_REPLY, {
                            cid,
                            payload,
                        });
                    };

                    const session = Session.getSession(guessArgs.guildID);
                    if (!session || !session.isGameSession()) {
                        reply({ ok: false, reason: "no_session" });
                        return;
                    }

                    if (KmqConfiguration.Instance.maintenanceModeEnabled()) {
                        reply({ ok: false, reason: "maintenance" });
                        return;
                    }

                    if (State.bannedPlayers.has(guessArgs.userID)) {
                        reply({ ok: false, reason: "banned" });
                        return;
                    }

                    if (!State.rateLimiter.check(guessArgs.userID)) {
                        reply({ ok: false, reason: "rate_limit" });
                        return;
                    }

                    const inVC = getCurrentVoiceMembers(
                        session.voiceChannelID,
                    ).some((m) => m.id === guessArgs.userID);

                    if (!inVC) {
                        reply({ ok: false, reason: "not_in_vc" });
                        return;
                    }

                    const messageContext = new MessageContext(
                        session.textChannelID,
                        new KmqMember(guessArgs.userID),
                        session.guildID,
                    );

                    // Fire and reply optimistically; guessSong is async but we
                    // don't need to block the admiral on the round-end work.
                    session
                        .guessSong(
                            messageContext,
                            guessArgs.guess,
                            guessArgs.ts,
                        )
                        .catch((e) => {
                            logger.error(
                                `Error in activity guess for gid=${guessArgs.guildID}, uid=${guessArgs.userID}. err=${e}`,
                            );
                        });

                    reply({ ok: true });
                    return;
                }

                case "startGame": {
                    const startArgs = args as ActivityStartGameArgs;
                    const reply = (payload: ActivityGuessResponse): void => {
                        State.ipc.sendToAdmiral(ACTIVITY_IPC_REPLY, {
                            cid,
                            payload,
                        });
                    };

                    runLocked(startArgs.guildID, async () => {
                        if (
                            KmqConfiguration.Instance.maintenanceModeEnabled()
                        ) {
                            reply({ ok: false, reason: "maintenance" });
                            return;
                        }

                        if (State.bannedPlayers.has(startArgs.userID)) {
                            reply({ ok: false, reason: "banned" });
                            return;
                        }

                        const existing = Session.getSession(startArgs.guildID);
                        if (existing && existing.sessionInitialized) {
                            reply({
                                ok: false,
                                reason: "session_already_running",
                            });
                            return;
                        }

                        const inVC = getCurrentVoiceMembers(
                            startArgs.voiceChannelID,
                        ).some((m) => m.id === startArgs.userID);

                        if (!inVC) {
                            reply({ ok: false, reason: "not_in_vc" });
                            return;
                        }

                        const messageContext = new MessageContext(
                            startArgs.textChannelID,
                            new KmqMember(startArgs.userID),
                            startArgs.guildID,
                        );

                        try {
                            await PlayCommand.startGame(
                                messageContext,
                                GameType.CLASSIC,
                                null,
                                false,
                                false,
                            );
                            reply({ ok: true });
                        } catch (e) {
                            logger.error(
                                `Error in activity startGame for gid=${startArgs.guildID}. err=${e}`,
                            );
                            reply({ ok: false, reason: "internal" });
                        }
                    });
                    return;
                }

                case "skipVote": {
                    const skipArgs = args as ActivityUserActionArgs;
                    const reply = (payload: ActivityGuessResponse): void => {
                        State.ipc.sendToAdmiral(ACTIVITY_IPC_REPLY, {
                            cid,
                            payload,
                        });
                    };

                    runLocked(skipArgs.guildID, async () => {
                        const session = Session.getSession(skipArgs.guildID);
                        if (!session) {
                            reply({ ok: false, reason: "no_session" });
                            return;
                        }

                        const originalRound = session.round;
                        if (!originalRound || originalRound.finished) {
                            reply({ ok: false, reason: "no_round" });
                            return;
                        }

                        const inVC = getCurrentVoiceMembers(
                            session.voiceChannelID,
                        ).some((m) => m.id === skipArgs.userID);

                        if (!inVC) {
                            reply({ ok: false, reason: "not_in_vc" });
                            return;
                        }

                        const messageContext = new MessageContext(
                            session.textChannelID,
                            new KmqMember(skipArgs.userID),
                            session.guildID,
                        );

                        try {
                            await SkipCommand.executeSkip(messageContext);

                            // After the await, the round may have transitioned
                            // (skipped or naturally ended). Compare by identity.
                            const currentRound = session.round;
                            const threshold = getMajorityCount(session.guildID);

                            if (currentRound === originalRound) {
                                pushEvent(session.guildID, {
                                    type: "skipProgress",
                                    requesters: currentRound!.getSkipCount(),
                                    threshold,
                                });
                            }

                            // Don't emit a `skipped` event here. When the skip
                            // threshold is reached, executeSkip ->
                            // SkipCommand.skipSong awaits endRound + startRound
                            // synchronously, so by the time we resume the
                            // bridge has already pushed roundEnd + roundStart
                            // on the wire. A trailing `skipped` would arrive
                            // after the next round's roundStart and re-set
                            // skip.achieved=true on the new round, leaving the
                            // skip button stuck in the "Skipped" state.

                            reply({ ok: true });
                        } catch (e) {
                            logger.error(
                                `Error in activity skipVote for gid=${skipArgs.guildID}. err=${e}`,
                            );
                            reply({ ok: false, reason: "internal" });
                        }
                    });
                    return;
                }

                case "hint": {
                    const hintArgs = args as ActivityUserActionArgs;
                    const reply = (payload: ActivityGuessResponse): void => {
                        State.ipc.sendToAdmiral(ACTIVITY_IPC_REPLY, {
                            cid,
                            payload,
                        });
                    };

                    runLocked(hintArgs.guildID, async () => {
                        const session = Session.getSession(hintArgs.guildID);
                        if (!session || !session.isGameSession()) {
                            reply({ ok: false, reason: "no_session" });
                            return;
                        }

                        const originalRound = session.round;
                        if (!originalRound || originalRound.finished) {
                            reply({ ok: false, reason: "no_round" });
                            return;
                        }

                        const inVC = getCurrentVoiceMembers(
                            session.voiceChannelID,
                        ).some((m) => m.id === hintArgs.userID);

                        if (!inVC) {
                            reply({ ok: false, reason: "not_in_vc" });
                            return;
                        }

                        const wasHintUsed = originalRound.hintUsed;
                        const messageContext = new MessageContext(
                            session.textChannelID,
                            new KmqMember(hintArgs.userID),
                            session.guildID,
                        );

                        try {
                            await HintCommand.sendHint(messageContext);

                            // Re-check the round identity post-await.
                            const currentRound = session.round;
                            if (
                                !currentRound ||
                                currentRound !== originalRound
                            ) {
                                reply({ ok: true });
                                return;
                            }

                            const requesters = currentRound.getHintRequests();
                            const threshold = getMajorityCount(session.guildID);

                            pushEvent(session.guildID, {
                                type: "hintProgress",
                                requesters,
                                threshold,
                            });

                            if (currentRound.hintUsed && !wasHintUsed) {
                                const guildPreference =
                                    await GuildPreference.getGuildPreference(
                                        session.guildID,
                                    );

                                const text = currentRound.getHint(
                                    session.guildID,
                                    guildPreference.gameOptions.guessModeType,
                                    State.getGuildLocale(session.guildID),
                                );

                                pushEvent(session.guildID, {
                                    type: "hintRevealed",
                                    text,
                                });
                            }

                            reply({ ok: true });
                        } catch (e) {
                            logger.error(
                                `Error in activity hint for gid=${hintArgs.guildID}. err=${e}`,
                            );
                            reply({ ok: false, reason: "internal" });
                        }
                    });
                    return;
                }

                case "setOption": {
                    const optionArgs = args as ActivitySetOptionArgs;
                    const reply = (payload: ActivityGuessResponse): void => {
                        State.ipc.sendToAdmiral(ACTIVITY_IPC_REPLY, {
                            cid,
                            payload,
                        });
                    };

                    runLocked(optionArgs.guildID, async () => {
                        if (
                            KmqConfiguration.Instance.maintenanceModeEnabled()
                        ) {
                            reply({ ok: false, reason: "maintenance" });
                            return;
                        }

                        if (State.bannedPlayers.has(optionArgs.userID)) {
                            reply({ ok: false, reason: "banned" });
                            return;
                        }

                        // Require the caller to be in the session's VC (when
                        // a session exists) OR the bot voice channel (when
                        // configuring from a lobby before /play is called).
                        // For the lobby case we can't cheaply verify a
                        // specific VC, so permit any caller in the guild.
                        const session = Session.getSession(optionArgs.guildID);
                        if (session) {
                            const inVC = getCurrentVoiceMembers(
                                session.voiceChannelID,
                            ).some((m) => m.id === optionArgs.userID);

                            if (!inVC) {
                                reply({ ok: false, reason: "not_in_vc" });
                                return;
                            }
                        }

                        try {
                            const guildPreference =
                                await GuildPreference.getGuildPreference(
                                    optionArgs.guildID,
                                );

                            switch (optionArgs.kind) {
                                case "gender": {
                                    if (optionArgs.genders.length === 0) {
                                        await guildPreference.reset(
                                            GameOption.GENDER,
                                        );
                                    } else {
                                        // Alternating is mutually exclusive.
                                        const genders =
                                            optionArgs.genders.includes(
                                                "alternating",
                                            )
                                                ? ["alternating" as const]
                                                : optionArgs.genders;

                                        await guildPreference.setGender(
                                            genders,
                                        );
                                    }

                                    break;
                                }

                                case "guessMode": {
                                    await guildPreference.setGuessModeType(
                                        optionArgs.guessMode,
                                    );
                                    break;
                                }

                                case "multiguess": {
                                    await guildPreference.setMultiGuessType(
                                        optionArgs.multiguess,
                                    );
                                    break;
                                }

                                default:
                                    // The discriminated union is exhaustive;
                                    // this branch is unreachable but the
                                    // linter wants an explicit default.
                                    break;
                            }

                            reply({ ok: true });
                        } catch (e) {
                            logger.error(
                                `Error in activity setOption for gid=${optionArgs.guildID}, kind=${optionArgs.kind}. err=${e}`,
                            );
                            reply({ ok: false, reason: "internal" });
                        }
                    });
                    return;
                }

                case "bookmark": {
                    const bookmarkArgs = args as ActivityBookmarkArgs;
                    const reply = (payload: ActivityBookmarkResponse): void => {
                        State.ipc.sendToAdmiral(ACTIVITY_IPC_REPLY, {
                            cid,
                            payload,
                        });
                    };

                    runLocked(bookmarkArgs.guildID, async () => {
                        const session = Session.getSession(
                            bookmarkArgs.guildID,
                        );

                        if (!session) {
                            reply({ ok: false, reason: "no_session" });
                            return;
                        }

                        // Resolve the link: prefer the explicit one, else fall
                        // back to the current round's song (so users can
                        // bookmark while the song plays without the iframe
                        // ever seeing the link).
                        const resolvedLink =
                            bookmarkArgs.youtubeLink ||
                            session.round?.song.youtubeLink;

                        if (!resolvedLink) {
                            reply({ ok: false, reason: "no_round" });
                            return;
                        }

                        try {
                            const song =
                                await SongSelector.getSongByLink(resolvedLink);

                            if (!song) {
                                reply({ ok: false, reason: "song_not_found" });
                                return;
                            }

                            session.addBookmarkedSong(bookmarkArgs.userID, {
                                song,
                                bookmarkedAt: new Date(),
                            });

                            reply({
                                ok: true,
                                songName: song.songName,
                                artistName: song.artistName,
                                youtubeLink: song.youtubeLink,
                            });
                        } catch (e) {
                            logger.error(
                                `Error in activity bookmark for gid=${bookmarkArgs.guildID}. err=${e}`,
                            );
                            reply({ ok: false, reason: "internal" });
                        }
                    });
                    return;
                }

                case "endGame": {
                    const endArgs = args as ActivityUserActionArgs;
                    const reply = (payload: ActivityGuessResponse): void => {
                        State.ipc.sendToAdmiral(ACTIVITY_IPC_REPLY, {
                            cid,
                            payload,
                        });
                    };

                    runLocked(endArgs.guildID, async () => {
                        const session = Session.getSession(endArgs.guildID);
                        if (!session) {
                            reply({ ok: false, reason: "no_session" });
                            return;
                        }

                        // Only the session owner (or someone in VC) can end —
                        // matches the relaxed posture of the existing /end
                        // command, which has no explicit owner check.
                        const inVC = getCurrentVoiceMembers(
                            session.voiceChannelID,
                        ).some((m) => m.id === endArgs.userID);

                        if (!inVC) {
                            reply({ ok: false, reason: "not_in_vc" });
                            return;
                        }

                        const messageContext = new MessageContext(
                            session.textChannelID,
                            new KmqMember(endArgs.userID),
                            session.guildID,
                        );

                        try {
                            await EndCommand.endGame(messageContext);
                            reply({ ok: true });
                        } catch (e) {
                            logger.error(
                                `Error in activity endGame for gid=${endArgs.guildID}. err=${e}`,
                            );
                            reply({ ok: false, reason: "internal" });
                        }
                    });
                    return;
                }

                default: {
                    State.ipc.sendToAdmiral(ACTIVITY_IPC_REPLY, {
                        cid,
                        error: `Unknown activity op: ${op as string}`,
                    });
                }
            }
        } catch (e) {
            logger.error(
                `Error handling activity:request. cid=${cid}. op=${op}. err=${e}`,
            );

            State.ipc.sendToAdmiral(ACTIVITY_IPC_REPLY, {
                cid,
                error: e instanceof Error ? e.message : String(e),
            });
        }
    });
}

/**
 * Registers the worker-side IPC handlers needed to answer admiral activity
 * requests. Call once during worker startup so the Activity can fetch a
 * snapshot for guilds that haven't started a game yet.
 */
export function initActivityWorker(): void {
    ensureWorkerHandlerRegistered();
}

/**
 * Attach activity-event forwarding to a GameSession. Subscribes to lifecycle
 * events emitted by the session and forwards JSON snapshots to the admiral.
 * @param session - The game session to instrument
 */
export function attachActivityBridge(session: GameSession): void {
    ensureWorkerHandlerRegistered();
    const { guildID } = session;

    // Defer sessionStart to the next tick. The session is constructed BEFORE
    // it's assigned to State.gameSessions, so a synchronous emit would arrive
    // at admiral subscribers before the session is registered. setImmediate
    // pushes after the current call stack unwinds, by which point the caller
    // (PlayCommand.startGame) has already assigned it.
    setImmediate(() => {
        pushEvent(guildID, {
            type: "sessionStart",
            session: snapshotSessionMeta(session),
        });
    });

    session.on("roundStart", (payload: RoundStartPayload) => {
        pushEvent(guildID, {
            type: "roundStart",
            round: {
                roundIndex: payload.roundIndex,
                songStartedAt: payload.songStartedAt,
                guessTimeoutSec: payload.guessTimeoutSec,
            },
        });
    });

    // Shared identity lookup. KmqMember instances on round results are bare
    // (id only); names come from the scoreboard's Player objects (populated
    // when each user joined VC) with a fall-back to the Eris user cache.
    const lookupName = (
        userID: string,
    ): { username: string; avatarUrl: string | null } => {
        const sbPlayer = session.scoreboard
            .getPlayers()
            .find((p) => p.id === userID);

        const cachedUser = State.client.users.get(userID);
        return {
            username:
                sbPlayer?.getName() ||
                sbPlayer?.username ||
                cachedUser?.username ||
                userID,
            avatarUrl:
                sbPlayer?.getAvatarURL() || cachedUser?.avatarURL || null,
        };
    };

    session.on("roundEnd", (payload: RoundEndPayload) => {
        const correctGuessers: ActivityCorrectGuesser[] =
            payload.playerRoundResults.map((r) => {
                const { username, avatarUrl } = lookupName(r.player.id);
                return {
                    id: r.player.id,
                    username,
                    avatarUrl,
                    pointsEarned: r.pointsEarned,
                    expGain: r.expGain,
                };
            });

        const songStart = session.round?.songStartedAt ?? null;
        const allGuesses = Object.entries(payload.guesses).flatMap(
            ([userID, list]) => {
                const last = list[list.length - 1];
                if (!last) return [];
                const { username, avatarUrl } = lookupName(userID);
                return [
                    {
                        userID,
                        username,
                        avatarUrl,
                        guess: last.guess,
                        isCorrect: last.correct,
                        ts:
                            songStart !== null
                                ? songStart + last.timeToGuessMs
                                : last.timeToGuessMs,
                    },
                ];
            },
        );

        pushEvent(guildID, {
            type: "roundEnd",
            song: snapshotSong(payload.song),
            correctGuessers,
            allGuesses,
            isCorrectGuess: payload.isCorrectGuess,
            scoreboard: snapshotScoreboard(session.scoreboard),
        });
    });

    session.on("scoreboardUpdate", () => {
        pushEvent(guildID, {
            type: "scoreboardUpdate",
            scoreboard: snapshotScoreboard(session.scoreboard),
        });
    });

    session.on("guessReceived", (payload: GuessReceivedPayload) => {
        const { username, avatarUrl } = lookupName(payload.userID);
        pushEvent(guildID, {
            type: "guessReceived",
            userID: payload.userID,
            username,
            avatarUrl,
            isCorrect: payload.isCorrect,
            ts: payload.ts,
        });
    });

    session.on("sessionEnd", (payload: SessionEndPayload) => {
        pushEvent(guildID, {
            type: "sessionEnd",
            reason: payload.reason,
        });

        // Drop our listeners now that the session is over. The Session object
        // becomes unreachable when State.gameSessions[guildID] is deleted; this
        // just avoids holding extra references via the EventEmitter for the
        // brief window before GC.
        setImmediate(() => session.removeAllListeners());
    });
}
