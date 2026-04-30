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
 * Provides clean voice state tracking and round-ID-tagged stream listeners.
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

    updateVoiceChannelID(channelID: string): void {
        this.voiceChannelID = channelID;
    }

    /** Ensure we have a ready voice connection. Joins if needed. */
    async ensureConnected(): Promise<void> {
        if (this._connection?.ready) {
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

        this._connection.removeAllListeners();
        this._connection.on("error", (err) => {
            logger.warn(
                `gid: ${this.guildID} | Voice WS error: ${extractErrorString(err)}`,
            );
        });
    }

    /**
     * Wait for the encoder to become idle if it's stuck in an encoding state.
     * Replaces the old 1-second delay hack with bounded polling.
     */
    async ensureEncoderIdle(): Promise<void> {
        if (!this._connection) {
            throw new Error(
                "Connection is unexpectedly null in ensureEncoderIdle",
            );
        }

        if (this._connection.ready) {
            return;
        }

        if (!this._connection.piper?.encoding) {
            return;
        }

        logger.warn(
            `gid: ${this.guildID} | Connection in encoding state, waiting for idle...`,
        );

        const deadline = Date.now() + 500;
        while (this._connection?.piper?.encoding && Date.now() < deadline) {
            // eslint-disable-next-line no-await-in-loop
            await delay(50);
        }

        if (this._connection?.piper?.encoding) {
            logger.warn(
                `gid: ${this.guildID} | Encoder still busy after timeout, force stopping`,
            );
            this._connection.stopPlaying();
        }
    }

    /**
     * Register a one-shot stream "end" handler tagged to a specific round.
     * Stale events (from a previous round) are silently ignored.
     */
    onceStreamEnd(
        roundId: string,
        onEnd: () => Promise<void>,
        onError: (err: Error) => Promise<void>,
    ): void {
        this.currentRoundId = roundId;
        this._state = VoiceState.PLAYING;

        if (!this._connection) return;

        this._connection.removeAllListeners("end");
        this._connection.removeAllListeners("error");

        this._connection.on("error", (err) => {
            logger.warn(
                `gid: ${this.guildID} | Voice WS error: ${extractErrorString(err)}`,
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
                `gid: ${this.guildID} | Stream error for round ${roundId}: ${extractErrorString(err)}`,
            );
            await onError(err as Error);
        });
    }

    stopPlaying(): void {
        this._connection?.stopPlaying();
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
                    ) as Eris.VoiceChannel | undefined;
                    voiceChannel?.leave();
                }
            } catch (e) {
                logger.error(
                    `gid: ${this.guildID} | Failed to disconnect voice: ${e}`,
                );
            }
        }

        this._connection = null;
        this._state = VoiceState.DISCONNECTED;
    }
}
