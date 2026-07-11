import { IPCLogger } from "../logger";
import { getWebRoomMembers } from "./web_room_state";
import GameSession from "./game_session";
import type { PlaybackSpec } from "./session";
import type ClipAction from "../enums/clip_action";
import type GameType from "../enums/game_type";
import type GuildPreference from "./guild_preference";
import type KmqMember from "./kmq_member";
import type MessageContext from "./message_context";
import type Round from "./round";

const logger = new IPCLogger("web_game_session");

// Extra time past the audio's nominal end before the round is ended, mirroring
// the lag between a song finishing and Eris delivering the "end" event.
const WEB_PLAYBACK_END_GRACE_SEC = 1;

/**
 * A GameSession that plays to a standalone-website room instead of a Discord
 * voice channel. Same game logic end to end — participants come from the
 * pushed room membership, playback becomes a `roundAudio` event that the
 * admiral turns into a browser audio stream, and the round-end trigger is a
 * timer standing in for the voice connection's "end" event. Embeds are
 * silently dropped by the empty text channel ID at the sendMessage guard.
 */
export default class WebGameSession extends GameSession {
    /** Stands in for the voice connection's "end" event. */
    private playbackEndTimer: NodeJS.Timeout | null = null;

    /** Duration of the most recently computed playback, for the timer. */
    private pendingPlaybackDurationSec: number | null = null;

    /**
     * True from beginPlayback until the next round's stopPlayback. Outlives
     * the end timer on purpose: Discord keeps a noop "end" listener after a
     * song finishes, so guesses stay eligible through the multiguess window
     * between playback end and round end — this flag mirrors that.
     */
    private playbackStarted = false;

    constructor(
        guildPreference: GuildPreference,
        roomGuildID: string,
        gameSessionCreator: KmqMember,
        gameType: GameType,
        eliminationLives?: number,
        clipDurationLength?: number,
        clipPlayNewClip?: boolean,
    ) {
        // Empty text/voice channel IDs: every embed send is null-guarded at
        // sendMessage, and no voice code path runs (all transport hooks are
        // overridden below).
        super(
            guildPreference,
            "",
            "",
            roomGuildID,
            gameSessionCreator,
            gameType,
            eliminationLives,
            clipDurationLength,
            clipPlayNewClip,
        );
    }

    isWebSession(): boolean {
        return true;
    }

    sessionName(): string {
        return "Web Game Session";
    }

    protected getParticipantIDs(): string[] {
        return getWebRoomMembers(this.guildID).map((m) => m.id);
    }

    // eslint-disable-next-line @typescript-eslint/member-ordering
    getVoteMajorityCount(): number {
        return Math.floor(this.getParticipantCount() * 0.5) + 1;
    }

    /**
     * Web rooms have no VC to join; just require someone to be present.
     * @param _messageContext - Unused
     * @returns whether the round may proceed
     */
    protected async preparePlaybackChannel(
        _messageContext: MessageContext,
    ): Promise<boolean> {
        if (this.getParticipantCount() === 0) {
            await this.endSessionFromLifecycle(
                "Web room is empty, during startRound",
                false,
            );
            return false;
        }

        return true;
    }

    protected playbackChannelReady(
        _messageContext: MessageContext,
        _clipAction: ClipAction | null,
    ): boolean {
        return true;
    }

    protected stopPlayback(): void {
        this.playbackStarted = false;
        if (this.playbackEndTimer) {
            clearTimeout(this.playbackEndTimer);
            this.playbackEndTimer = null;
        }
    }

    protected isPlaybackActive(): boolean {
        return this.playbackStarted;
    }

    /**
     * "Plays" by broadcasting the audio spec; the admiral converts it into an
     * opaque streaming URL for the room's browsers (Phase 4).
     * @param spec - The resolved audio parameters
     * @param round - The round being played
     */
    // eslint-disable-next-line @typescript-eslint/require-await
    protected async beginPlayback(
        spec: PlaybackSpec,
        round: Round,
    ): Promise<void> {
        const limitArg = spec.encoderArgs["-t"]?.[0];
        const limitSec = limitArg ? parseFloat(limitArg) : NaN;

        this.pendingPlaybackDurationSec = Number.isFinite(limitSec)
            ? limitSec
            : Math.max(5, spec.songDuration - spec.seekLocation);

        this.playbackStarted = true;
        this.emit("roundAudio", {
            youtubeLink: round.song.youtubeLink,
            songLocation: spec.songLocation,
            seekLocation: spec.seekLocation,
            songDuration: spec.songDuration,
            inputArgs: spec.inputArgs,
            encoderArgs: Object.entries(spec.encoderArgs).flatMap((x) => [
                x[0],
                x[1].join(","),
            ]),
            playbackDurationSec: this.pendingPlaybackDurationSec,
            songStartedAt: round.songStartedAt,
        });
    }

    /**
     * Timer analog of the voice connection's "end" event. The pending timer
     * is cleared by the next playback's stopPlayback (the analog of the
     * listener reset in ensureVoiceConnection) and on session end.
     * @param messageContext - An object containing relevant parts of Eris.Message
     * @param round - The round being played
     * @param clipAction - The clip action the playback was started with
     */
    protected armPlaybackEnd(
        messageContext: MessageContext,
        round: Round,
        clipAction: ClipAction | null,
    ): void {
        const durationSec =
            (this.pendingPlaybackDurationSec ?? 5) + WEB_PLAYBACK_END_GRACE_SEC;

        // Replace (never stack) a pending timer, without touching the
        // playback-active flag beginPlayback just set.
        if (this.playbackEndTimer) {
            clearTimeout(this.playbackEndTimer);
        }

        this.playbackEndTimer = setTimeout(() => {
            this.playbackEndTimer = null;
            this.handlePlaybackEnd(messageContext, round, clipAction).catch(
                (e) => {
                    logger.error(
                        `gid: ${this.guildID} | Error in web playback end. err = ${e}`,
                    );
                },
            );
        }, durationSec * 1000);
    }

    protected guesserInSessionChannels(
        messageContext: MessageContext,
    ): boolean {
        return this.getParticipantIDs().includes(messageContext.author.id);
    }

    // eslint-disable-next-line @typescript-eslint/member-ordering
    async endSession(reason: string, endedDueToError: boolean): Promise<void> {
        this.stopPlayback();
        await super.endSession(reason, endedDueToError);
    }
}
