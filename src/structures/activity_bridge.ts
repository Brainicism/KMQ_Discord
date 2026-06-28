import {
    ACTIVITY_AUTOCOMPLETE_LIMIT,
    ACTIVITY_IPC_EVENT,
    ACTIVITY_IPC_REPLY,
    ACTIVITY_IPC_REQUEST,
    ACTIVITY_SONG_SEARCH_LIMIT,
    DEFAULT_LOCALE,
    HIDDEN_DEFAULT_TIMER,
    youtubeThumbnailUrl,
} from "../constants";
import { IPCLogger } from "../logger";
import {
    botHasVoicePermissions,
    getMajorityCount,
    getUserVoiceChannelID,
    searchArtists,
} from "../helpers/discord_utils";
import { onGuildPreferenceChanged } from "../helpers/guild_preference_events";
import { parseKmqPlaylistIdentifier } from "../helpers/utils";
import { songTagEmojisToUnicode } from "../helpers/game_utils";
import EndCommand from "../commands/game_commands/end";
import GameOption from "../enums/game_option_name";
import applyPlaylistFromURL from "../helpers/playlist_utils";
// Not a cycle: game_session.ts no longer imports this module — the
// attachActivityBridge call was moved to PlayCommand alongside the
// State.gameSessions write, so this import is a one-way edge.
import {
    MAX_NUM_PRESETS,
    PRESET_NAME_MAX_LENGTH,
} from "../commands/game_commands/preset";
import GameRound from "./game_round";
import GameSession from "./game_session";
import GameType from "../enums/game_type";
import GuildPreference from "./guild_preference";
import HintCommand from "../commands/game_commands/hint";
import KmqConfiguration from "../kmq_configuration";
import KmqMember from "./kmq_member";
import LocaleType from "../enums/locale_type";
import LookupCommand from "../commands/misc_commands/lookup";
import MessageContext from "./message_context";
import MultipleChoiceGuessResult from "../enums/multiple_choice_guess_result";
import ProfileCommand from "../commands/game_commands/profile";
import Session from "./session";
import SkipCommand from "../commands/game_commands/skip";
import SongSelector from "./song_selector";
import State from "../state";
import type { ActivityMultipleChoiceOption } from "../interfaces/activity_round_meta";
import type ActivityAutocompleteArtistsArgs from "../interfaces/activity_autocomplete_artists_args";
import type ActivityAutocompleteArtistsResponse from "../interfaces/activity_autocomplete_artists_response";
import type ActivityBookmarkArgs from "../interfaces/activity_bookmark_args";
import type ActivityBookmarkResponse from "../interfaces/activity_bookmark_response";
import type ActivityCorrectGuesser from "../interfaces/activity_correct_guesser";
import type ActivityEvent from "../interfaces/activity_event";
import type ActivityGuessArgs from "../interfaces/activity_guess_args";
import type ActivityGuessResponse from "../interfaces/activity_guess_response";
import type ActivityMcGuessArgs from "../interfaces/activity_mc_guess_args";
import type ActivityOptionsSnapshot from "../interfaces/activity_options_snapshot";
import type ActivityPresetArgs from "../interfaces/activity_preset_args";
import type ActivityPresetResponse from "../interfaces/activity_preset_response";
import type ActivityProfileArgs from "../interfaces/activity_profile_args";
import type ActivityProfileResponse from "../interfaces/activity_profile_response";
import type ActivityRequestMessage from "../interfaces/activity_request_message";
import type ActivityScoreboardPlayer from "../interfaces/activity_scoreboard_player";
import type ActivityScoreboardSnapshot from "../interfaces/activity_scoreboard_snapshot";
import type ActivitySearchSongsArgs from "../interfaces/activity_search_songs_args";
import type ActivitySearchSongsResponse from "../interfaces/activity_search_songs_response";
import type ActivitySessionMeta from "../interfaces/activity_session_meta";
import type ActivitySetOptionArgs from "../interfaces/activity_set_option_args";
import type ActivitySnapshot from "../interfaces/activity_snapshot";
import type ActivitySnapshotArgs from "../interfaces/activity_snapshot_args";
import type ActivitySongInfoArgs from "../interfaces/activity_song_info_args";
import type ActivitySongInfoResponse from "../interfaces/activity_song_info_response";
import type ActivityStartGameArgs from "../interfaces/activity_start_game_args";
import type ActivityUserActionArgs from "../interfaces/activity_user_action_args";
import type MatchedArtist from "../interfaces/matched_artist";
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

/**
 * Resolve Activity-supplied artist IDs into MatchedArtist[] the
 * GuildPreference setters expect. Unknown IDs are silently dropped; an
 * empty input becomes an empty output which GuildPreference treats as
 * "no groups selected" (and the subsequent length check in
 * isGroupsMode/isIncludesMode/isExcludesMode returns false).
 * @param artistIDs - IDs as submitted by the client
 * @returns the cached MatchedArtist entries, in input order
 */
function resolveArtistIDs(artistIDs: number[]): MatchedArtist[] {
    const out: MatchedArtist[] = [];
    for (const id of artistIDs) {
        const match = State.artistIDToEntry.get(id);
        if (match) out.push(match);
    }

    return out;
}

function snapshotOptions(
    guildPreference: GuildPreference,
): ActivityOptionsSnapshot {
    const opts = guildPreference.gameOptions;
    const playlistID = guildPreference.getKmqPlaylistID();
    const toActivity = (
        list: { id: number; name: string }[] | null,
    ): { id: number; name: string }[] | null =>
        list === null ? null : list.map((a) => ({ id: a.id, name: a.name }));

    return {
        gender: [...opts.gender],
        guessMode: opts.guessModeType,
        multiguess: opts.multiGuessType,
        limitStart: opts.limitStart,
        limitEnd: opts.limitEnd,
        beginningYear: opts.beginningYear,
        endYear: opts.endYear,
        goal: opts.goal,
        timer: opts.guessTimeout,
        duration: opts.duration,
        shuffle: opts.shuffleType,
        seek: opts.seekType,
        language: opts.languageType,
        release: opts.releaseType,
        artisttype: opts.artistType,
        subunits: opts.subunitPreference,
        answerType: opts.answerType,
        ost: opts.ostPreference,
        special: opts.specialType,
        groups: toActivity(opts.groups),
        includes: toActivity(opts.includes),
        excludes: toActivity(opts.excludes),
        playlist: playlistID
            ? {
                  type: parseKmqPlaylistIdentifier(playlistID).isSpotify
                      ? "spotify"
                      : "youtube",
                  identifier: playlistID,
              }
            : null,
    };
}

/**
 * Maps a round's generated MC buttons into the client-facing choice list.
 * The correct answer is intentionally not flagged — the client can't tell
 * which option is right until the round ends.
 * @param round - the active game round
 * @returns the shuffled choices (id + label), or undefined if none generated
 */
function snapshotMultipleChoiceOptions(
    round: GameRound,
): Array<ActivityMultipleChoiceOption> | undefined {
    if (round.multipleChoiceOptions.length === 0) {
        return undefined;
    }

    return round.multipleChoiceOptions.map((button) => ({
        id: button.custom_id,
        label: button.label ?? "",
    }));
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
                      timerStartedAt: round.timerStartedAt,
                      // Include MC choices so a client opening mid-round renders
                      // the grid immediately; undefined in typing/hidden modes.
                      choices: guildPreference.isMultipleChoiceMode()
                          ? snapshotMultipleChoiceOptions(round)
                          : undefined,
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

/**
 * Whether the user is actually connected to the given voice channel, read from
 * their own voice state. The web layer already verified the caller is a Discord
 * activity participant, but activities can be launched in text channels or used
 * without joining voice — so we additionally require real voice presence before
 * letting someone control or play the game.
 * @param guildID - the guild
 * @param userID - the calling user
 * @param voiceChannelID - the channel they must be connected to
 * @returns whether the user is in that voice channel
 */
function userInVoiceChannel(
    guildID: string,
    userID: string,
    voiceChannelID: string,
): boolean {
    return getUserVoiceChannelID(guildID, userID) === voiceChannelID;
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
    timerStartedAt: number;
}

interface RoundChoicesPayload {
    roundIndex: number;
    choices: ActivityMultipleChoiceOption[];
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

                    if (
                        !userInVoiceChannel(
                            guessArgs.guildID,
                            guessArgs.userID,
                            session.voiceChannelID,
                        )
                    ) {
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

                case "mcGuess": {
                    const mcArgs = args as ActivityMcGuessArgs;
                    const reply = (payload: ActivityGuessResponse): void => {
                        State.ipc.sendToAdmiral(ACTIVITY_IPC_REPLY, {
                            cid,
                            payload,
                        });
                    };

                    const session = Session.getSession(mcArgs.guildID);
                    if (!session || !session.isGameSession()) {
                        reply({ ok: false, reason: "no_session" });
                        return;
                    }

                    if (KmqConfiguration.Instance.maintenanceModeEnabled()) {
                        reply({ ok: false, reason: "maintenance" });
                        return;
                    }

                    if (State.bannedPlayers.has(mcArgs.userID)) {
                        reply({ ok: false, reason: "banned" });
                        return;
                    }

                    if (!State.rateLimiter.check(mcArgs.userID)) {
                        reply({ ok: false, reason: "rate_limit" });
                        return;
                    }

                    if (
                        !userInVoiceChannel(
                            mcArgs.guildID,
                            mcArgs.userID,
                            session.voiceChannelID,
                        )
                    ) {
                        reply({ ok: false, reason: "not_in_vc" });
                        return;
                    }

                    const messageContext = new MessageContext(
                        session.textChannelID,
                        new KmqMember(mcArgs.userID),
                        session.guildID,
                    );

                    // Reply at most once. The pick is accepted (and recorded)
                    // before the round-lifecycle transition runs, so we ack as
                    // soon as it's accepted via onAccepted rather than waiting
                    // for guessSong → endRound, which can block on the
                    // lifecycleMutex for many seconds and blow past the
                    // client's request timeout even though the guess landed.
                    let replied = false;
                    const replyOnce = (
                        payload: ActivityGuessResponse,
                    ): void => {
                        if (replied) return;
                        replied = true;
                        reply(payload);
                    };

                    session
                        .submitMultipleChoiceGuess(
                            mcArgs.userID,
                            mcArgs.choiceID,
                            mcArgs.ts,
                            messageContext,
                            undefined,
                            // CORRECT/INCORRECT both accepted the pick; the
                            // client learns correctness from the guessReceived
                            // / roundEnd events.
                            () => replyOnce({ ok: true }),
                        )
                        .then((result) => {
                            // onAccepted never fired → INELIGIBLE (no round /
                            // already picked / not eligible). Reject so the
                            // client can surface it. (If it did fire, this is a
                            // no-op.)
                            replyOnce(
                                result === MultipleChoiceGuessResult.INELIGIBLE
                                    ? { ok: false, reason: "no_round" }
                                    : { ok: true },
                            );
                        })
                        .catch((e) => {
                            logger.error(
                                `Error in activity mc-guess for gid=${mcArgs.guildID}, uid=${mcArgs.userID}. err=${e}`,
                            );
                            // If we already acked the accepted pick, the round
                            // transition just failed downstream — keep the ack.
                            replyOnce({ ok: false, reason: "internal" });
                        });

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

                        // Start the game in the channel the caller is actually
                        // connected to — NOT startArgs.voiceChannelID, which is
                        // where the activity was launched (it can be a text
                        // channel, or a VC the user later left/changed). The
                        // activity can be opened without joining voice, so being
                        // a Discord participant isn't enough.
                        const startVoiceChannelID = getUserVoiceChannelID(
                            startArgs.guildID,
                            startArgs.userID,
                        );

                        if (!startVoiceChannelID) {
                            reply({ ok: false, reason: "not_in_vc" });
                            return;
                        }

                        // ...and the bot must be able to join that channel.
                        if (!botHasVoicePermissions(startVoiceChannelID)) {
                            reply({
                                ok: false,
                                reason: "bot_no_voice_perms",
                            });
                            return;
                        }

                        const messageContext = new MessageContext(
                            startArgs.textChannelID,
                            new KmqMember(startArgs.userID),
                            startArgs.guildID,
                        );

                        try {
                            // Inline classic-mode start. Duplicates the tail
                            // of PlayCommand.startGameLocked on purpose —
                            // once Phase 5 retires the chat-channel /play
                            // flow the full slash-command variant goes away
                            // and this becomes the only start path. Keeping
                            // the import graph acyclic matters more than
                            // the small duplication here (Activity bridge
                            // must not import PlayCommand, because
                            // play.ts → game_session.ts → activity_bridge.ts
                            // would cycle right back through PlayCommand).
                            const guildPreference =
                                await GuildPreference.getGuildPreference(
                                    startArgs.guildID,
                                );

                            const gameOwner = new KmqMember(startArgs.userID);
                            // Clip mode plays a fresh portion each round (the
                            // slash command's default `new_clip` is false, but
                            // for the lobby-less Activity a new song per round
                            // matches every other mode's behaviour).
                            const gameSession = new GameSession(
                                guildPreference,
                                startArgs.textChannelID,
                                startVoiceChannelID,
                                startArgs.guildID,
                                gameOwner,
                                startArgs.gameType,
                                startArgs.gameType === GameType.ELIMINATION
                                    ? startArgs.eliminationLives
                                    : undefined,
                                startArgs.gameType === GameType.CLIP
                                    ? startArgs.clipDuration
                                    : undefined,
                                startArgs.gameType === GameType.CLIP
                                    ? true
                                    : undefined,
                            );

                            // Swap out any stale non-initialized session
                            // (mirrors the slash-command path).
                            const previous = Session.getSession(
                                startArgs.guildID,
                            );

                            if (previous) {
                                await previous.endSession(
                                    "Replaced by Activity startGame",
                                    false,
                                );
                            }

                            gameSession.startedViaActivity = true;
                            State.gameSessions[startArgs.guildID] = gameSession;
                            // Safe to forward-reference: IPC handlers only
                            // fire after module load is complete.
                            // eslint-disable-next-line @typescript-eslint/no-use-before-define
                            attachActivityBridge(gameSession);

                            if (
                                gameSession.isHiddenMode() &&
                                !guildPreference.isGuessTimeoutSet()
                            ) {
                                await guildPreference.setGuessTimeout(
                                    HIDDEN_DEFAULT_TIMER,
                                );
                            }

                            await gameSession.startRound(messageContext);
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

                        if (
                            !userInVoiceChannel(
                                skipArgs.guildID,
                                skipArgs.userID,
                                session.voiceChannelID,
                            )
                        ) {
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

                        if (
                            !userInVoiceChannel(
                                hintArgs.guildID,
                                hintArgs.userID,
                                session.voiceChannelID,
                            )
                        ) {
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

                                // Compact (unspaced, unlabelled) hint — the
                                // Activity styles it itself, so it doesn't want
                                // the chat label/backticks/inter-char spaces.
                                const text = currentRound.getCompactHint(
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

                        // When a game is running, require the caller to be in
                        // its voice channel (read from their own voice state).
                        // Before a game exists there's no specific channel to
                        // check, so any authenticated participant may configure.
                        const session = Session.getSession(optionArgs.guildID);
                        if (
                            session &&
                            !userInVoiceChannel(
                                optionArgs.guildID,
                                optionArgs.userID,
                                session.voiceChannelID,
                            )
                        ) {
                            reply({ ok: false, reason: "not_in_vc" });
                            return;
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

                                case "limit": {
                                    await guildPreference.setLimit(
                                        optionArgs.limitStart,
                                        optionArgs.limitEnd,
                                    );
                                    break;
                                }

                                case "cutoff": {
                                    // Two setters + two DB writes, but each
                                    // one funnels through updateGuildPreferences
                                    // → guildPreferenceChanged, so clients get
                                    // two back-to-back optionsChanged events.
                                    // Acceptable for now; reducer overwrites.
                                    await guildPreference.setBeginningCutoffYear(
                                        optionArgs.beginningYear,
                                    );

                                    await guildPreference.setEndCutoffYear(
                                        optionArgs.endYear,
                                    );
                                    break;
                                }

                                case "goal": {
                                    await guildPreference.setGoal(
                                        optionArgs.goal,
                                    );
                                    break;
                                }

                                case "timer": {
                                    await guildPreference.setGuessTimeout(
                                        optionArgs.timer,
                                    );

                                    // Apply to the live round immediately,
                                    // mirroring the /timer command: restart
                                    // the guess-timeout from now and push the
                                    // new countdown reference so the Activity
                                    // timer reflects the change mid-round
                                    // instead of waiting for the next round.
                                    if (
                                        session &&
                                        session.isGameSession() &&
                                        session.round &&
                                        session.connection?.playing
                                    ) {
                                        session.stopGuessTimeout();
                                        session.startGuessTimeout(
                                            new MessageContext(
                                                session.textChannelID,
                                                null,
                                                optionArgs.guildID,
                                            ),
                                        );
                                        const timerStartedAt = Date.now();
                                        session.round.timerStartedAt =
                                            timerStartedAt;

                                        pushEvent(optionArgs.guildID, {
                                            type: "roundTimerChanged",
                                            guessTimeoutSec:
                                                session.getGuessTimeoutSec(),
                                            timerStartedAt,
                                        });
                                    }

                                    break;
                                }

                                case "duration": {
                                    // Activity exposes set + clear. The
                                    // slash-command's add/remove delta UX
                                    // is intentionally not mirrored; it's
                                    // a CLI convenience that doesn't suit
                                    // a point-and-click panel.
                                    await guildPreference.setDuration(
                                        optionArgs.duration,
                                    );
                                    break;
                                }

                                case "shuffle": {
                                    await guildPreference.setShuffleType(
                                        optionArgs.shuffle,
                                    );
                                    break;
                                }

                                case "seek": {
                                    await guildPreference.setSeekType(
                                        optionArgs.seek,
                                    );
                                    break;
                                }

                                case "language": {
                                    await guildPreference.setLanguageType(
                                        optionArgs.language,
                                    );
                                    break;
                                }

                                case "release": {
                                    await guildPreference.setReleaseType(
                                        optionArgs.release,
                                    );
                                    break;
                                }

                                case "artisttype": {
                                    await guildPreference.setArtistType(
                                        optionArgs.artisttype,
                                    );
                                    break;
                                }

                                case "subunits": {
                                    await guildPreference.setSubunitPreference(
                                        optionArgs.subunits,
                                    );
                                    break;
                                }

                                case "answer": {
                                    // setAnswerType fires answerTypeChangeCallback,
                                    // which re-renders MC buttons mid-round (and
                                    // thus pushes roundChoices) when switching to
                                    // multiple choice — matching the slash-command
                                    // behaviour.
                                    await guildPreference.setAnswerType(
                                        optionArgs.answer,
                                    );
                                    break;
                                }

                                case "ost": {
                                    await guildPreference.setOstPreference(
                                        optionArgs.ost,
                                    );
                                    break;
                                }

                                case "special": {
                                    await guildPreference.setSpecialType(
                                        optionArgs.special,
                                    );
                                    break;
                                }

                                case "groups":
                                case "includes":
                                case "excludes": {
                                    const artists = resolveArtistIDs(
                                        optionArgs.artistIDs,
                                    );

                                    if (optionArgs.kind === "groups") {
                                        await guildPreference.setGroups(
                                            artists,
                                        );
                                    } else if (optionArgs.kind === "includes") {
                                        await guildPreference.setIncludes(
                                            artists,
                                        );
                                    } else {
                                        await guildPreference.setExcludes(
                                            artists,
                                        );
                                    }

                                    break;
                                }

                                case "playlist": {
                                    if (optionArgs.playlistURL === null) {
                                        // Clear the playlist and the limit it
                                        // auto-set (matches /playlist reset).
                                        await guildPreference.reset(
                                            GameOption.PLAYLIST_ID,
                                        );

                                        await guildPreference.reset(
                                            GameOption.LIMIT,
                                        );
                                        break;
                                    }

                                    // No messageContext/interaction: the
                                    // matcher skips progress messaging and just
                                    // matches. The GuildPreference writes inside
                                    // trigger the options broadcast via the
                                    // onGuildPreferenceChanged hook.
                                    const playlistResult =
                                        await applyPlaylistFromURL(
                                            guildPreference,
                                            optionArgs.playlistURL,
                                        );

                                    if (!playlistResult.ok) {
                                        const reasonMap = {
                                            invalid_url: "playlist_invalid_url",
                                            unsupported_url:
                                                "playlist_unsupported_url",
                                            no_matches: "playlist_no_matches",
                                            resolve_failed:
                                                "playlist_resolve_failed",
                                        } as const;

                                        reply({
                                            ok: false,
                                            reason: reasonMap[
                                                playlistResult.reason
                                            ],
                                        });
                                        return;
                                    }

                                    // Pin the limit to the matched-song count,
                                    // mirroring the slash command.
                                    await guildPreference.setLimit(
                                        0,
                                        playlistResult.matchedPlaylist.metadata
                                            .matchedSongsLength,
                                    );
                                    break;
                                }

                                case "reset": {
                                    await guildPreference.resetToDefault();
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

                        // Any member of the game's voice channel may end it
                        // (matches the relaxed /end command, which has no owner
                        // check) — but they must actually be in that channel.
                        if (
                            !userInVoiceChannel(
                                endArgs.guildID,
                                endArgs.userID,
                                session.voiceChannelID,
                            )
                        ) {
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

                case "preset": {
                    const presetArgs = args as ActivityPresetArgs;
                    const reply = (payload: ActivityPresetResponse): void => {
                        State.ipc.sendToAdmiral(ACTIVITY_IPC_REPLY, {
                            cid,
                            payload,
                        });
                    };

                    if (State.bannedPlayers.has(presetArgs.userID)) {
                        reply({ ok: false, reason: "banned" });
                        return;
                    }

                    // Mirror setOption's guard: once a game is running, only
                    // members of its voice channel may touch options/presets.
                    const presetSession = Session.getSession(
                        presetArgs.guildID,
                    );

                    if (
                        presetSession &&
                        !userInVoiceChannel(
                            presetArgs.guildID,
                            presetArgs.userID,
                            presetSession.voiceChannelID,
                        )
                    ) {
                        reply({ ok: false, reason: "not_in_vc" });
                        return;
                    }

                    // Serialize per guild so concurrent save/delete can't race
                    // the count/uniqueness checks.
                    runLocked(presetArgs.guildID, async () => {
                        try {
                            const guildPreference =
                                await GuildPreference.getGuildPreference(
                                    presetArgs.guildID,
                                );

                            const name = (presetArgs.name ?? "").trim();
                            switch (presetArgs.action) {
                                case "list":
                                    break;
                                case "save": {
                                    if (!name) {
                                        reply({ ok: false, reason: "no_name" });
                                        return;
                                    }

                                    if (name.length > PRESET_NAME_MAX_LENGTH) {
                                        reply({
                                            ok: false,
                                            reason: "name_too_long",
                                        });
                                        return;
                                    }

                                    if (name.startsWith("KMQ-")) {
                                        reply({
                                            ok: false,
                                            reason: "illegal_prefix",
                                        });
                                        return;
                                    }

                                    if (
                                        (await guildPreference.listPresets())
                                            .length >= MAX_NUM_PRESETS
                                    ) {
                                        reply({
                                            ok: false,
                                            reason: "too_many",
                                        });
                                        return;
                                    }

                                    // savePreset returns false when a preset
                                    // with this name already exists.
                                    const saved =
                                        await guildPreference.savePreset(
                                            name,
                                            null,
                                        );

                                    if (!saved) {
                                        reply({ ok: false, reason: "exists" });
                                        return;
                                    }

                                    break;
                                }

                                case "load": {
                                    if (!name) {
                                        reply({ ok: false, reason: "no_name" });
                                        return;
                                    }

                                    // loadPreset persists the options, firing
                                    // guildPreferenceChanged → the panel
                                    // refreshes via the optionsChanged
                                    // broadcast.
                                    const [loaded] =
                                        await guildPreference.loadPreset(
                                            name,
                                            presetArgs.guildID,
                                        );

                                    if (!loaded) {
                                        reply({
                                            ok: false,
                                            reason: "not_found",
                                        });
                                        return;
                                    }

                                    break;
                                }

                                case "delete": {
                                    if (!name) {
                                        reply({ ok: false, reason: "no_name" });
                                        return;
                                    }

                                    const deleted =
                                        await guildPreference.deletePreset(
                                            name,
                                        );

                                    if (!deleted) {
                                        reply({
                                            ok: false,
                                            reason: "not_found",
                                        });
                                        return;
                                    }

                                    break;
                                }

                                default:
                                    reply({ ok: false, reason: "internal" });
                                    return;
                            }

                            const presets = await guildPreference.listPresets();
                            reply({ ok: true, presets });
                        } catch (e) {
                            logger.error(
                                `Error in activity preset for gid=${presetArgs.guildID}, action=${presetArgs.action}. err=${e}`,
                            );

                            reply({ ok: false, reason: "internal" });
                        }
                    });

                    return;
                }

                case "autocompleteArtists": {
                    // Reads from this worker's already-populated artist
                    // caches (State.artistToEntry / State.topArtists seeded
                    // by reloadCaches at worker boot). No guild / session
                    // context; the data is process-wide.
                    const autocompleteArgs =
                        args as ActivityAutocompleteArtistsArgs;

                    // searchArtists matches against keys normalized via
                    // normalizePunctuationInName (which strips spaces and
                    // punctuation), so the query must be normalized the same
                    // way — otherwise "red velvet" never matches "redvelvet".
                    const query = GameRound.normalizePunctuationInName(
                        autocompleteArgs.query.trim(),
                    );

                    // searchArtists can return the same artist more than once
                    // when several of its aliases share the typed prefix (e.g.
                    // "loona"/"loonatheworld"). Dedupe by id so the client
                    // never renders two suggestions with the same React key
                    // (duplicate keys corrupt list reconciliation, leaving
                    // stale rows until the list remounts), and so the limit
                    // counts distinct artists.
                    const seen = new Set<number>();
                    const results: ActivityAutocompleteArtistsResponse["results"] =
                        [];

                    for (const a of searchArtists(query, [])) {
                        if (seen.has(a.id)) {
                            continue;
                        }

                        seen.add(a.id);
                        results.push({
                            id: a.id,
                            name: a.name,
                            hangulName: a.hangulName ?? null,
                        });

                        if (results.length >= ACTIVITY_AUTOCOMPLETE_LIMIT) {
                            break;
                        }
                    }

                    const payload: ActivityAutocompleteArtistsResponse = {
                        results,
                    };

                    State.ipc.sendToAdmiral(ACTIVITY_IPC_REPLY, {
                        cid,
                        payload,
                    });
                    return;
                }

                case "profile": {
                    // Read-only: player_stats is process-wide, so no session
                    // or guild lock is needed. The web layer has already
                    // validated targetUserID is an instance participant.
                    const profileArgs = args as ActivityProfileArgs;
                    const reply = (payload: ActivityProfileResponse): void => {
                        State.ipc.sendToAdmiral(ACTIVITY_IPC_REPLY, {
                            cid,
                            payload,
                        });
                    };

                    const targetUserID =
                        profileArgs.targetUserID ?? profileArgs.userID;

                    ProfileCommand.getProfileStats(
                        targetUserID,
                        profileArgs.guildID,
                    )
                        .then((stats) =>
                            reply(
                                stats
                                    ? { found: true, stats }
                                    : { found: false },
                            ),
                        )
                        .catch((e) => {
                            logger.error(
                                `Error in activity profile for gid=${profileArgs.guildID}, target=${targetUserID}. err=${e}`,
                            );

                            reply({ found: false });
                        });

                    return;
                }

                case "songInfo": {
                    // Read-only metadata lookup for a single (already-revealed)
                    // song. Routed by guild so includedInOptions resolves
                    // against this guild's GuildPreference; the localized names
                    // use the guild locale (matching the round reveal).
                    const songInfoArgs = args as ActivitySongInfoArgs;
                    const reply = (payload: ActivitySongInfoResponse): void => {
                        State.ipc.sendToAdmiral(ACTIVITY_IPC_REPLY, {
                            cid,
                            payload,
                        });
                    };

                    LookupCommand.getSongInfo(
                        songInfoArgs.youtubeLink,
                        songInfoArgs.guildID,
                        State.getGuildLocale(songInfoArgs.guildID),
                    )
                        .then((info) =>
                            reply(
                                info
                                    ? {
                                          found: true,
                                          // Web clients can't resolve Discord
                                          // emoji shortcodes; send Unicode.
                                          info: {
                                              ...info,
                                              tags: songTagEmojisToUnicode(
                                                  info.tags,
                                              ),
                                          },
                                      }
                                    : { found: false },
                            ),
                        )
                        .catch((e) => {
                            logger.error(
                                `Error in activity songInfo for gid=${songInfoArgs.guildID}, link=${songInfoArgs.youtubeLink}. err=${e}`,
                            );

                            reply({ found: false });
                        });

                    return;
                }

                case "searchSongs": {
                    // Searches the song catalog by name. The available_songs
                    // table is identical across workers, so no guild/session
                    // context is needed.
                    const searchArgs = args as ActivitySearchSongsArgs;
                    const locale = (
                        Object.values(LocaleType) as string[]
                    ).includes(searchArgs.locale)
                        ? (searchArgs.locale as LocaleType)
                        : DEFAULT_LOCALE;

                    const query = searchArgs.query.trim();
                    if (query.length === 0) {
                        State.ipc.sendToAdmiral(ACTIVITY_IPC_REPLY, {
                            cid,
                            payload: {
                                results: [],
                            } as ActivitySearchSongsResponse,
                        });
                        return;
                    }

                    LookupCommand.searchSongEntries(
                        query,
                        locale,
                        ACTIVITY_SONG_SEARCH_LIMIT,
                    )
                        .then((entries) => {
                            const payload: ActivitySearchSongsResponse = {
                                results: entries.map((entry) => ({
                                    youtubeLink: entry.youtubeLink,
                                    songName:
                                        entry.getLocalizedSongName(locale),
                                    artistName:
                                        entry.getLocalizedArtistName(locale),
                                    publishYear:
                                        entry.publishDate.getFullYear(),
                                })),
                            };

                            State.ipc.sendToAdmiral(ACTIVITY_IPC_REPLY, {
                                cid,
                                payload,
                            });
                        })
                        .catch((e) => {
                            logger.error(
                                `Error in activity searchSongs for query=${query}. err=${e}`,
                            );

                            State.ipc.sendToAdmiral(ACTIVITY_IPC_REPLY, {
                                cid,
                                payload: {
                                    results: [],
                                } as ActivitySearchSongsResponse,
                            });
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
                timerStartedAt: payload.timerStartedAt,
            },
        });
    });

    session.on("roundChoices", (payload: RoundChoicesPayload) => {
        pushEvent(guildID, {
            type: "roundChoices",
            roundIndex: payload.roundIndex,
            choices: payload.choices,
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
                // Time to guess: the player's last correct guess in this round.
                const playerGuesses = payload.guesses[r.player.id];
                const correctGuess = playerGuesses
                    ?.filter((g) => g.correct)
                    .at(-1);

                return {
                    id: r.player.id,
                    username,
                    avatarUrl,
                    pointsEarned: r.pointsEarned,
                    expGain: r.expGain,
                    streak: r.streak,
                    timeToGuessMs: correctGuess?.timeToGuessMs ?? null,
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

        const counter = session.getUniqueSongCounter();

        pushEvent(guildID, {
            type: "roundEnd",
            song: snapshotSong(payload.song),
            correctGuessers,
            allGuesses,
            isCorrectGuess: payload.isCorrectGuess,
            scoreboard: snapshotScoreboard(session.scoreboard),
            songCounter: {
                uniqueSongsPlayed: counter.uniqueSongsPlayed,
                totalSongs: counter.totalSongs,
            },
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
