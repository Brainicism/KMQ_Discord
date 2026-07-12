import * as uuid from "uuid";
import {
    ACTIVITY_IPC_EVENT,
    ACTIVITY_IPC_REPLY,
    ACTIVITY_IPC_REQUEST,
    ACTIVITY_REQUEST_TIMEOUT_MS,
    WEB_AUDIO_SWEEP_INTERVAL_MS,
    WEB_AUDIO_URL_PREFIX,
} from "./constants";
import { IPCLogger } from "./logger";
import { WebAudioRegistry } from "./web_audio_registry";
import type { Fleet } from "eris-fleet";
import type { WebAudioEntry } from "./web_audio_registry";
import type ActivityAutocompleteArtistsArgs from "./interfaces/activity_autocomplete_artists_args";
import type ActivityAutocompleteArtistsResponse from "./interfaces/activity_autocomplete_artists_response";
import type ActivityBookmarkArgs from "./interfaces/activity_bookmark_args";
import type ActivityBookmarkResponse from "./interfaces/activity_bookmark_response";
import type ActivityEmoteArgs from "./interfaces/activity_emote_args";
import type ActivityGuessArgs from "./interfaces/activity_guess_args";
import type ActivityGuessResponse from "./interfaces/activity_guess_response";
import type ActivityMcGuessArgs from "./interfaces/activity_mc_guess_args";
import type ActivityPresetArgs from "./interfaces/activity_preset_args";
import type ActivityPresetResponse from "./interfaces/activity_preset_response";
import type ActivityProfileArgs from "./interfaces/activity_profile_args";
import type ActivityProfileResponse from "./interfaces/activity_profile_response";
import type ActivityReplyMessage from "./interfaces/activity_reply_message";
import type ActivityRequestOp from "./enums/activity_request_op";
import type ActivitySearchSongsArgs from "./interfaces/activity_search_songs_args";
import type ActivitySearchSongsResponse from "./interfaces/activity_search_songs_response";
import type ActivitySetOptionArgs from "./interfaces/activity_set_option_args";
import type ActivitySnapshot from "./interfaces/activity_snapshot";
import type ActivitySongInfoArgs from "./interfaces/activity_song_info_args";
import type ActivitySongInfoResponse from "./interfaces/activity_song_info_response";
import type ActivityStartGameArgs from "./interfaces/activity_start_game_args";
import type ActivityUserActionArgs from "./interfaces/activity_user_action_args";
import type ActivityWebRoomMembershipArgs from "./interfaces/activity_web_room_membership_args";
import type ActivityWorkerEventMessage from "./interfaces/activity_worker_event_message";

const logger = new IPCLogger("activity_hub");

const audioUrlForToken = (token: string): string =>
    `${WEB_AUDIO_URL_PREFIX}/${token}`;

export interface ActivitySubscriber {
    id: string;
    send: (data: string) => void;
    close: () => void;
}

interface PendingRequest {
    resolve: (payload: unknown) => void;
    reject: (err: Error) => void;
    timer: NodeJS.Timeout;
}

export default class ActivityHub {
    private fleet: Fleet;

    private guildSubscribers: Map<string, Set<ActivitySubscriber>> = new Map();

    private pending: Map<string, PendingRequest> = new Map();

    private clusterRanges: Array<{
        clusterID: number;
        firstShardID: number;
        lastShardID: number;
    }> = [];

    private shardCount: number = 0;

    private wired: boolean = false;

    /** Opaque-token registry for web-room audio streams. */
    private audioRegistry: WebAudioRegistry = new WebAudioRegistry();

    /**
     * Epoch ms of the announced bot restart, or null when none is pending.
     * Set from the admiral's /announce-restart endpoint — the same signal
     * that warns Discord text channels — and broadcast to every subscriber.
     */
    private restartsAtEpochMs: number | null = null;

    constructor(fleet: Fleet) {
        this.fleet = fleet;
    }

    async start(): Promise<void> {
        if (this.wired) return;
        this.wired = true;

        await this.refreshClusterMap();

        this.fleet.on(ACTIVITY_IPC_EVENT, (msg: ActivityWorkerEventMessage) => {
            this.handleWorkerEvent(msg);
        });

        this.fleet.on(ACTIVITY_IPC_REPLY, (msg: ActivityReplyMessage) => {
            this.handleWorkerReply(msg);
        });

        setInterval(() => {
            this.audioRegistry.sweep(Date.now());
        }, WEB_AUDIO_SWEEP_INTERVAL_MS).unref();

        logger.info(
            `ActivityHub started. shardCount=${this.shardCount}, clusters=${this.clusterRanges.length}`,
        );
    }

    /**
     * Computes the cluster ID owning the given guild.
     * @param guildID - Discord guild snowflake
     * @returns the cluster ID, or null if the cluster map is empty
     */
    clusterIdForGuild(guildID: string): number | null {
        if (this.shardCount <= 0 || this.clusterRanges.length === 0) {
            return null;
        }

        const shardID = Number(
            (BigInt(guildID) >> 22n) % BigInt(this.shardCount),
        );

        const range = this.clusterRanges.find(
            (r) => shardID >= r.firstShardID && shardID <= r.lastShardID,
        );

        return range?.clusterID ?? null;
    }

    /**
     * Fetches the current session snapshot for a guild.
     * @param guildID - the guild whose session to read
     * @returns the snapshot; `hasSession` is false if no GameSession is active
     */
    async requestSnapshot(guildID: string): Promise<ActivitySnapshot> {
        const clusterID = await this.resolveCluster(guildID);
        const snapshot = await this.sendRequest<ActivitySnapshot>(
            clusterID,
            "snapshot",
            { guildID },
        );

        // Web rooms: point late joiners/reconnects at the audio already
        // playing (the registry only ever has entries for web guilds).
        const audio = this.audioRegistry.currentForGuild(guildID, Date.now());
        if (audio && snapshot.hasSession) {
            snapshot.currentAudio = {
                audioUrl: audioUrlForToken(audio.token),
                playbackDurationSec: audio.playbackDurationSec,
            };
        }

        // Late joiners/reconnects learn about a pending restart from the
        // snapshot; everyone already connected got the broadcast.
        if (
            this.restartsAtEpochMs !== null &&
            this.restartsAtEpochMs > Date.now()
        ) {
            snapshot.restartWarning = {
                restartsAtEpochMs: this.restartsAtEpochMs,
            };
        }

        return snapshot;
    }

    /**
     * Submits a guess to the worker hosting the given guild.
     * @param guildID - the guild whose game session to submit to
     * @param userID - the Discord user submitting the guess
     * @param guess - the raw guess text
     * @param ts - the guess timestamp in epoch ms
     * @returns the worker's accept/reject response
     */
    async submitGuess(
        guildID: string,
        userID: string,
        guess: string,
        ts: number,
    ): Promise<ActivityGuessResponse> {
        const target = await this.resolveCluster(guildID);
        const args: ActivityGuessArgs = { guildID, userID, guess, ts };
        return this.sendRequest<ActivityGuessResponse>(target, "guess", args);
    }

    /**
     * Submits a multiple-choice pick to the worker hosting the given guild.
     * @param guildID - the guild whose game session to submit to
     * @param userID - the Discord user submitting the pick
     * @param choiceID - the round button custom_id (uuid) that was tapped
     * @param ts - the pick timestamp in epoch ms
     * @returns the worker's accept/reject response
     */
    async submitMcGuess(
        guildID: string,
        userID: string,
        choiceID: string,
        ts: number,
    ): Promise<ActivityGuessResponse> {
        const target = await this.resolveCluster(guildID);
        const args: ActivityMcGuessArgs = { guildID, userID, choiceID, ts };
        return this.sendRequest<ActivityGuessResponse>(target, "mcGuess", args);
    }

    /**
     * Sends a startGame request to the worker hosting the given guild.
     * @param args - the args including voiceChannelID/textChannelID
     * @returns the worker's accept/reject response
     */
    async startGame(
        args: ActivityStartGameArgs,
    ): Promise<ActivityGuessResponse> {
        const target = await this.resolveCluster(args.guildID);
        return this.sendRequest<ActivityGuessResponse>(
            target,
            "startGame",
            args,
        );
    }

    /**
     * Sends a skipVote request.
     * @param args - guildID/userID
     * @returns the worker's accept/reject response
     */
    async skipVote(
        args: ActivityUserActionArgs,
    ): Promise<ActivityGuessResponse> {
        const target = await this.resolveCluster(args.guildID);
        return this.sendRequest<ActivityGuessResponse>(
            target,
            "skipVote",
            args,
        );
    }

    /**
     * Sends an endGame request.
     * @param args - guildID/userID
     * @returns the worker's accept/reject response
     */
    async endGame(
        args: ActivityUserActionArgs,
    ): Promise<ActivityGuessResponse> {
        const target = await this.resolveCluster(args.guildID);
        return this.sendRequest<ActivityGuessResponse>(target, "endGame", args);
    }

    /**
     * Pushes a web room's membership snapshot to the worker owning its
     * synthetic guild ID (empty members = room closed, ends any game).
     * @param args - guildID/members
     * @returns the worker's ack
     */
    async webRoomMembership(
        args: ActivityWebRoomMembershipArgs,
    ): Promise<ActivityGuessResponse> {
        const target = await this.resolveCluster(args.guildID);
        return this.sendRequest<ActivityGuessResponse>(
            target,
            "webRoomMembership",
            args,
        );
    }

    /**
     * Sends a hint vote.
     * @param args - guildID/userID
     * @returns the worker's accept/reject response
     */
    async hint(args: ActivityUserActionArgs): Promise<ActivityGuessResponse> {
        const target = await this.resolveCluster(args.guildID);
        return this.sendRequest<ActivityGuessResponse>(target, "hint", args);
    }

    /**
     * Flings an emote into the round; the worker re-broadcasts it to all
     * viewers of the guild.
     * @param args - guildID/userID/emote
     * @returns the worker's accept/reject response
     */
    async emote(args: ActivityEmoteArgs): Promise<ActivityGuessResponse> {
        const target = await this.resolveCluster(args.guildID);
        return this.sendRequest<ActivityGuessResponse>(target, "emote", args);
    }

    /**
     * Bookmarks a song.
     * @param args - guildID/userID/youtubeLink
     * @returns the worker's accept/reject response with song metadata
     */
    async bookmark(
        args: ActivityBookmarkArgs,
    ): Promise<ActivityBookmarkResponse> {
        const target = await this.resolveCluster(args.guildID);
        return this.sendRequest<ActivityBookmarkResponse>(
            target,
            "bookmark",
            args,
        );
    }

    /**
     * Applies a GuildPreference change submitted from the Activity.
     * @param args - the discriminated payload; see ActivitySetOptionArgs
     * @returns the worker's accept/reject response
     */
    async setOption(
        args: ActivitySetOptionArgs,
    ): Promise<ActivityGuessResponse> {
        const target = await this.resolveCluster(args.guildID);
        return this.sendRequest<ActivityGuessResponse>(
            target,
            "setOption",
            args,
        );
    }

    /**
     * Lists / saves / loads / deletes a game-option preset for the guild.
     * @param args - the preset action + name; see ActivityPresetArgs
     * @returns the worker's response, including the refreshed preset list
     */
    async preset(args: ActivityPresetArgs): Promise<ActivityPresetResponse> {
        const target = await this.resolveCluster(args.guildID);
        return this.sendRequest<ActivityPresetResponse>(target, "preset", args);
    }

    /**
     * Fetches a player's profile stats. Routed by guild only to land on a
     * worker — `player_stats` is process-wide, so any worker can answer; the
     * guild routing just reuses the existing cluster map.
     * @param args - the requesting + target user; see ActivityProfileArgs
     * @returns the worker's profile response (found:false when no stats)
     */
    async profile(args: ActivityProfileArgs): Promise<ActivityProfileResponse> {
        const target = await this.resolveCluster(args.guildID);
        return this.sendRequest<ActivityProfileResponse>(
            target,
            "profile",
            args,
        );
    }

    /**
     * Looks up artists matching a query prefix. Dispatched to any available
     * worker — the artist cache is identical across workers, so routing by
     * guild isn't needed. Falls back to an empty result set if no worker
     * is up yet.
     * @param query - raw (untrimmed, any case) user input
     * @returns the worker's top-N matches
     */
    async autocompleteArtists(
        query: string,
    ): Promise<ActivityAutocompleteArtistsResponse> {
        if (this.clusterRanges.length === 0) {
            await this.refreshClusterMap();
        }

        const target = this.clusterRanges[0]?.clusterID;
        if (target === undefined) {
            return { results: [] };
        }

        const args: ActivityAutocompleteArtistsArgs = { query };
        return this.sendRequest<ActivityAutocompleteArtistsResponse>(
            target,
            "autocompleteArtists",
            args,
        );
    }

    /**
     * Looks up full metadata for a song by its YouTube ID. Routed by guild —
     * `includedInOptions` depends on the guild's GuildPreference (and the
     * localized names on its locale), so it must land on a worker that can
     * resolve them.
     * @param args - the guild + YouTube ID; see ActivitySongInfoArgs
     * @returns the song info, or found:false when the ID isn't a known song
     */
    async songInfo(
        args: ActivitySongInfoArgs,
    ): Promise<ActivitySongInfoResponse> {
        const target = await this.resolveCluster(args.guildID);
        return this.sendRequest<ActivitySongInfoResponse>(
            target,
            "songInfo",
            args,
        );
    }

    /**
     * Searches the song catalog by name. Dispatched to any available worker —
     * the song cache is identical across workers, so routing by guild isn't
     * needed. Falls back to an empty result set if no worker is up yet.
     * @param query - raw (untrimmed, any case) song-name query
     * @param locale - locale picking which localized name to match + return
     * @returns the worker's top-N matches
     */
    async searchSongs(
        query: string,
        locale: string,
    ): Promise<ActivitySearchSongsResponse> {
        if (this.clusterRanges.length === 0) {
            await this.refreshClusterMap();
        }

        const target = this.clusterRanges[0]?.clusterID;
        if (target === undefined) {
            return { results: [] };
        }

        const args: ActivitySearchSongsArgs = { query, locale };
        return this.sendRequest<ActivitySearchSongsResponse>(
            target,
            "searchSongs",
            args,
        );
    }

    /**
     * Adds a subscriber to receive live events for a guild.
     * @param guildID - the guild whose events to forward
     * @param subscriber - the subscriber's send/close handles
     */
    subscribe(guildID: string, subscriber: ActivitySubscriber): void {
        let subs = this.guildSubscribers.get(guildID);
        if (!subs) {
            subs = new Set();
            this.guildSubscribers.set(guildID, subs);
        }

        subs.add(subscriber);
    }

    /**
     * Removes a subscriber.
     * @param guildID - the guild the subscriber was watching
     * @param subscriber - the subscriber to remove
     */
    unsubscribe(guildID: string, subscriber: ActivitySubscriber): void {
        const subs = this.guildSubscribers.get(guildID);
        if (!subs) return;
        subs.delete(subscriber);
        if (subs.size === 0) {
            this.guildSubscribers.delete(guildID);
        }
    }

    /**
     * Redeems an audio-stream token minted from a roundAudio event.
     * @param token - the opaque token from the audio URL
     * @returns the playback entry, or null if unknown/expired
     */
    getAudioEntry(token: string): WebAudioEntry | null {
        return this.audioRegistry.get(token, Date.now());
    }

    /**
     * Announces (or retracts, with null) an impending bot restart to every
     * connected subscriber — embedded Activities and web rooms alike, whether
     * or not a game is running.
     * @param restartsAtEpochMs - when the restart happens, or null to retract
     */
    setRestartNotice(restartsAtEpochMs: number | null): void {
        this.restartsAtEpochMs = restartsAtEpochMs;
        const wireData = JSON.stringify({
            type: "restartWarning",
            restartsAtEpochMs,
        });

        for (const guildID of this.guildSubscribers.keys()) {
            this.fanOut(guildID, wireData);
        }

        logger.info(
            `Restart notice ${
                restartsAtEpochMs === null
                    ? "cleared"
                    : `set for ${new Date(restartsAtEpochMs).toISOString()}`
            }; ${this.getSubscriberCount()} subscribers notified.`,
        );
    }

    /** @returns total number of active subscribers across all guilds */
    getSubscriberCount(): number {
        let total = 0;
        for (const subs of this.guildSubscribers.values()) {
            total += subs.size;
        }

        return total;
    }

    private async resolveCluster(guildID: string): Promise<number> {
        let target = this.clusterIdForGuild(guildID);
        if (target === null) {
            await this.refreshClusterMap();
            target = this.clusterIdForGuild(guildID);
        }

        if (target === null) {
            throw new Error(
                `No cluster found for guild ${guildID} (cluster map unavailable)`,
            );
        }

        return target;
    }

    private async refreshClusterMap(): Promise<void> {
        const workers = await this.fleet.ipc.getWorkers();
        this.clusterRanges = [];
        let maxShard = -1;
        for (const cluster of workers.clusters.values()) {
            this.clusterRanges.push({
                clusterID: cluster.clusterID,
                firstShardID: cluster.firstShardID,
                lastShardID: cluster.lastShardID,
            });

            if (cluster.lastShardID > maxShard) {
                maxShard = cluster.lastShardID;
            }
        }

        this.shardCount = maxShard + 1;
    }

    private handleWorkerEvent(msg: ActivityWorkerEventMessage): void {
        // roundAudio carries the raw playback spec, which names the song —
        // it must never reach clients pre-reveal. Mint an opaque streaming
        // token and fan out only the URL.
        if (msg.event.type === "roundAudio") {
            const entry = this.audioRegistry.mint(
                msg.guildID,
                {
                    songLocation: msg.event.songLocation,
                    inputArgs: msg.event.inputArgs,
                    encoderArgs: msg.event.encoderArgs,
                    playbackDurationSec: msg.event.playbackDurationSec,
                },
                Date.now(),
            );

            this.fanOut(
                msg.guildID,
                JSON.stringify({
                    type: "roundAudio",
                    audioUrl: audioUrlForToken(entry.token),
                    playbackDurationSec: entry.playbackDurationSec,
                }),
            );
            return;
        }

        if (msg.event.type === "sessionEnd") {
            this.audioRegistry.clearGuild(msg.guildID);
        }

        this.fanOut(msg.guildID, JSON.stringify(msg.event));
    }

    private fanOut(guildID: string, wireData: string): void {
        const subscribers = this.guildSubscribers.get(guildID);
        if (!subscribers || subscribers.size === 0) {
            return;
        }

        for (const sub of subscribers) {
            try {
                sub.send(wireData);
            } catch (e) {
                logger.warn(
                    `Failed to send activity event to subscriber ${sub.id}. err=${e}`,
                );
            }
        }
    }

    private handleWorkerReply(msg: ActivityReplyMessage): void {
        const pending = this.pending.get(msg.cid);
        if (!pending) {
            return;
        }

        this.pending.delete(msg.cid);
        clearTimeout(pending.timer);

        if (msg.error) {
            pending.reject(new Error(msg.error));
        } else {
            pending.resolve(msg.payload);
        }
    }

    private sendRequest<T>(
        clusterID: number,
        op: ActivityRequestOp,
        args:
            | { guildID: string }
            | ActivityGuessArgs
            | ActivityMcGuessArgs
            | ActivityStartGameArgs
            | ActivityUserActionArgs
            | ActivityBookmarkArgs
            | ActivitySetOptionArgs
            | ActivityAutocompleteArtistsArgs
            | ActivityPresetArgs
            | ActivityWebRoomMembershipArgs,
    ): Promise<T> {
        const cid = uuid.v4();
        return new Promise<T>((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(cid);
                reject(
                    new Error(
                        `Activity request timed out (cid=${cid}, op=${op})`,
                    ),
                );
            }, ACTIVITY_REQUEST_TIMEOUT_MS);

            this.pending.set(cid, {
                resolve: (p) => resolve(p as T),
                reject,
                timer,
            });

            try {
                this.fleet.ipc.sendTo(clusterID, ACTIVITY_IPC_REQUEST, {
                    cid,
                    op,
                    args,
                });
            } catch (e) {
                this.pending.delete(cid);
                clearTimeout(timer);
                reject(e instanceof Error ? e : new Error(String(e)));
            }
        });
    }
}
