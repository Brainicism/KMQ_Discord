import * as uuid from "uuid";
import {
    ACTIVITY_IPC_EVENT,
    ACTIVITY_IPC_REPLY,
    ACTIVITY_IPC_REQUEST,
} from "./structures/activity_types";
import { IPCLogger } from "./logger";
import type {
    ActivityBookmarkArgs,
    ActivityBookmarkResponse,
    ActivityGuessArgs,
    ActivityGuessResponse,
    ActivityReplyMessage,
    ActivityRequestOp,
    ActivitySnapshot,
    ActivityStartGameArgs,
    ActivityUserActionArgs,
    ActivityWorkerEventMessage,
} from "./structures/activity_types";
import type { Fleet } from "eris-fleet";

const logger = new IPCLogger("activity_hub");

const REQUEST_TIMEOUT_MS = 10_000;

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
        const clusterID = this.clusterIdForGuild(guildID);
        if (clusterID === null) {
            await this.refreshClusterMap();
            const retry = this.clusterIdForGuild(guildID);
            if (retry === null) {
                throw new Error(
                    `No cluster found for guild ${guildID} (cluster map unavailable)`,
                );
            }

            return this.sendRequest<ActivitySnapshot>(retry, "snapshot", {
                guildID,
            });
        }

        return this.sendRequest<ActivitySnapshot>(clusterID, "snapshot", {
            guildID,
        });
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
     * Sends a hint vote.
     * @param args - guildID/userID
     * @returns the worker's accept/reject response
     */
    async hint(args: ActivityUserActionArgs): Promise<ActivityGuessResponse> {
        const target = await this.resolveCluster(args.guildID);
        return this.sendRequest<ActivityGuessResponse>(target, "hint", args);
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
        const subscribers = this.guildSubscribers.get(msg.guildID);
        if (!subscribers || subscribers.size === 0) {
            return;
        }

        const wireData = JSON.stringify(msg.event);
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
            | ActivityStartGameArgs
            | ActivityUserActionArgs
            | ActivityBookmarkArgs,
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
            }, REQUEST_TIMEOUT_MS);

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
