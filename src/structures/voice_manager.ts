/* eslint-disable no-underscore-dangle */
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
    private voiceConnection: Eris.VoiceConnection | null = null;
    private voiceState: VoiceState = VoiceState.DISCONNECTED;
    private currentRoundId: string | null = null;

    constructor(
        private readonly guildID: string,
        private voiceChannelID: string,
        private readonly client: KmqClient,
    ) {}

    get connection(): Eris.VoiceConnection | null {
        return this.voiceConnection;
    }

    get state(): VoiceState {
        return this.voiceState;
    }

    updateVoiceChannelID(channelID: string): void {
        this.voiceChannelID = channelID;
    }

    /** Ensure we have a ready voice connection. Joins if needed. */
    async ensureConnected(): Promise<void> {
        if (this.voiceConnection?.ready) {
            return;
        }

        this.voiceState = VoiceState.CONNECTING;

        try {
            this.voiceConnection = await this.client.joinVoiceChannel(
                this.voiceChannelID,
                { opusOnly: true, selfDeaf: true },
            );

            this.voiceState = VoiceState.READY;
        } catch (err) {
            this.voiceState = VoiceState.DISCONNECTED;
            throw err;
        }

        this.voiceConnection.removeAllListeners();
        this.voiceConnection.on("error", (err) => {
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
        if (!this.voiceConnection) {
            throw new Error(
                "Connection is unexpectedly null in ensureEncoderIdle",
            );
        }

        if (this.voiceConnection.ready) {
            return;
        }

        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (!this.voiceConnection.piper?.encoding) {
            return;
        }

        logger.warn(
            `gid: ${this.guildID} | Connection in encoding state, waiting for idle...`,
        );

        const deadline = Date.now() + 500;
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        while (this.voiceConnection?.piper?.encoding && Date.now() < deadline) {
            // eslint-disable-next-line no-await-in-loop
            await delay(50);
        }

        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (this.voiceConnection?.piper?.encoding) {
            logger.warn(
                `gid: ${this.guildID} | Encoder still busy after timeout, force stopping`,
            );
            this.voiceConnection.stopPlaying();
        }
    }

    /**
     * Register a one-shot stream "end" handler tagged to a specific round.
     * Stale events (from a previous round) are silently ignored.
     * @param roundId - The unique identifier for the current round
     * @param onEnd - Callback invoked when the stream ends for this round
     * @param onError - Callback invoked when a stream error occurs for this round
     */
    onceStreamEnd(
        roundId: string,
        onEnd: () => Promise<void>,
        onError: (err: Error) => Promise<void>,
    ): void {
        this.currentRoundId = roundId;
        this.voiceState = VoiceState.PLAYING;

        if (!this.voiceConnection) return;

        this.voiceConnection.removeAllListeners("end");
        this.voiceConnection.removeAllListeners("error");

        this.voiceConnection.on("error", (err) => {
            logger.warn(
                `gid: ${this.guildID} | Voice WS error: ${extractErrorString(err)}`,
            );
        });

        this.voiceConnection.once("end", async () => {
            if (this.currentRoundId !== roundId) {
                logger.info(
                    `gid: ${this.guildID} | Ignoring stale stream end for round ${roundId} (current: ${this.currentRoundId})`,
                );
                return;
            }

            this.voiceState = VoiceState.READY;
            await onEnd();
        });

        this.voiceConnection.once("error", async (err) => {
            if (this.currentRoundId !== roundId) return;

            this.voiceState = VoiceState.ERROR;
            logger.error(
                `gid: ${this.guildID} | Stream error for round ${roundId}: ${extractErrorString(err)}`,
            );
            await onError(err as Error);
        });
    }

    stopPlaying(): void {
        this.voiceConnection?.stopPlaying();
    }

    /** Disconnect from voice and clean up all listeners. */
    disconnect(): void {
        this.currentRoundId = null;
        if (this.voiceConnection) {
            this.voiceConnection.stopPlaying();
            this.voiceConnection.removeAllListeners();
            try {
                if (this.voiceConnection.channelID) {
                    const voiceChannel = this.client.getChannel(
                        this.voiceConnection.channelID,
                    ) as Eris.VoiceChannel | undefined;

                    voiceChannel?.leave();
                }
            } catch (e) {
                logger.error(
                    `gid: ${this.guildID} | Failed to disconnect voice: ${e}`,
                );
            }
        }

        this.voiceConnection = null;
        this.voiceState = VoiceState.DISCONNECTED;
    }
}
