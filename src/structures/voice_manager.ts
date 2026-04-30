import { IPCLogger } from "../logger";
import { delay, extractErrorString } from "../helpers/utils";
import type Eris from "eris";
import type KmqClient from "../kmq_client";

const logger = new IPCLogger("voice_manager");

export enum VoiceState {
    DISCONNECTED = "DISCONNECTED",
    CONNECTING = "CONNECTING",
    READY = "READY",
    PLAYING = "PLAYING",
    ERROR = "ERROR",
}

/**
 * Manages the voice connection lifecycle for a session.
 * Extracted from Session to provide clean voice state tracking
 * and round-ID-tagged stream listeners.
 *
 * Phase 4: Created as standalone class. Not yet wired into Session
 * (Session still manages its own connection directly).
 */
export class VoiceManager {
    private _connection: Eris.VoiceConnection | null = null;
    private _state: VoiceState = VoiceState.DISCONNECTED;
    private currentRoundId: string | null = null;

    constructor(
        private readonly guildID: string,
        private voiceChannelID: string,
        private readonly client: KmqClient,
    ) {}

    get connection(): Eris.VoiceConnection | null {
        return this._connection;
    }

    get state(): VoiceState {
        return this._state;
    }

    /** Update the voice channel ID (e.g., when bot is moved) */
    updateVoiceChannelID(channelID: string): void {
        this.voiceChannelID = channelID;
    }

    /**
     * Ensure we have a ready voice connection. Joins if needed.
     * Equivalent to the old ensureVoiceConnection + ensureConnectionReady.
     */
    async ensureConnected(): Promise<void> {
        if (this._connection && this._connection.ready) {
            return;
        }

        this._state = VoiceState.CONNECTING;

        try {
            this._connection = await this.client.joinVoiceChannel(
                this.voiceChannelID,
                { opusOnly: true, selfDeaf: true },
            );

            this._state = VoiceState.READY;
        } catch (err) {
            this._state = VoiceState.DISCONNECTED;
            throw err;
        }

        // Clear existing listeners and attach generic error handler
        this._connection.removeAllListeners();
        this._connection.on("error", (err) => {
            logger.warn(
                `Error receiving from voice connection WS. ${extractErrorString(err)}`,
            );
        });
    }

    /**
     * Check if connection encoder is stale and wait for it to become idle.
     * Replaces the old ensureConnectionReady delay hack with polling.
     */
    async ensureEncoderIdle(): Promise<void> {
        if (!this._connection) {
            throw new Error(
                "Connection is unexpectedly null in ensureEncoderIdle",
            );
        }

        if (this._connection.channelID) {
            return; // connection is valid
        }

        if (!this._connection.piper?.encoding) {
            return; // not in encoding state
        }

        logger.warn(
            `gid: ${this.guildID} | Connection is unexpectedly in encoding state. Waiting for idle...`,
        );

        // Poll for encoder to become idle (up to 500ms), then force stop
        const deadline = Date.now() + 500;
        while (this._connection?.piper?.encoding && Date.now() < deadline) {
            // eslint-disable-next-line no-await-in-loop
            await delay(50);
        }

        if (this._connection?.piper?.encoding) {
            logger.warn(
                `gid: ${this.guildID} | Connection still encoding after timeout, force stopping.`,
            );
            this._connection.stopPlaying();
        }
    }

    /**
     * Register a one-shot stream "end" handler tagged to a specific round.
     * If the round ID has changed by the time the event fires, the handler
     * is ignored. This prevents stale end-of-stream handlers from triggering
     * on the wrong round (BANDAID-05).
     *
     * @param roundId - Unique identifier for the current round
     * @param onEnd - Callback when stream ends for this round
     * @param onError - Callback when stream errors for this round
     */
    onceStreamEnd(
        roundId: string,
        onEnd: () => Promise<void>,
        onError: (err: Error) => Promise<void>,
    ): void {
        this.currentRoundId = roundId;

        if (!this._connection) return;

        // Remove previous listeners to avoid stacking
        this._connection.removeAllListeners("end");
        this._connection.removeAllListeners("error");

        // Re-attach generic error handler
        this._connection.on("error", (err) => {
            logger.warn(
                `Error receiving from voice connection WS. ${extractErrorString(err)}`,
            );
        });

        this._connection.once("end", async () => {
            if (this.currentRoundId !== roundId) {
                logger.info(
                    `gid: ${this.guildID} | Ignoring stale stream end for round ${roundId} (current: ${this.currentRoundId})`,
                );
                return;
            }

            this._state = VoiceState.READY;
            await onEnd();
        });

        this._connection.once("error", async (err) => {
            if (this.currentRoundId !== roundId) return;

            this._state = VoiceState.ERROR;
            logger.error(
                `Stream error for round ${roundId}: ${extractErrorString(err)}`,
            );
            await onError(err as Error);
        });
    }

    /** Stop playing audio. */
    stopPlaying(): void {
        if (this._connection) {
            this._connection.stopPlaying();
        }
    }

    /** Disconnect from voice and clean up all listeners. */
    disconnect(): void {
        this.currentRoundId = null;
        if (this._connection) {
            this._connection.stopPlaying();
            this._connection.removeAllListeners();
            try {
                if (this._connection.channelID) {
                    const voiceChannel = this.client.getChannel(
                        this._connection.channelID,
                    ) as Eris.VoiceChannel | null;
                    voiceChannel?.leave();
                }
            } catch (e) {
                logger.error(
                    `Failed to disconnect voice for gid: ${this.guildID}. err = ${e}`,
                );
            }
        }

        this._connection = null;
        this._state = VoiceState.DISCONNECTED;
    }
}
