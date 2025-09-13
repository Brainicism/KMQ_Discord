import * as Eris from "eris";
import { IPCLogger } from "../logger.js";
import { SKIP_BUTTON_PREFIX } from "../constants.js";
import { codeLine, friendlyFormattedNumber } from "../helpers/utils.js";
import SeekType from "../enums/option_types/seek_type.js";
import State from "../state.js";
import i18n from "../helpers/localization_manager.js";
import type { ButtonActionRow } from "../types.js";
import type ClipAction from "../enums/clip_action.js";
import type MessageContext from "./message_context.js";
import type PlayerRoundResult from "../interfaces/player_round_result.js";
import type QueriedSong from "./queried_song.js";
import type UniqueSongCounter from "../interfaces/unique_song_counter.js";

const logger = new IPCLogger("round");

export default abstract class Round {
    /** The song associated with the round */
    public readonly song: QueriedSong;

    /** The potential song aliases */
    public readonly songAliases: string[];

    /** The potential artist aliases */
    public readonly artistAliases: string[];

    /** Timestamp of the creation of the Round in epoch milliseconds */
    public readonly startedAt: number;

    /** The Discord Guild ID */
    public readonly guildID: string;

    /** Timestamp of when the song started playing in epoch milliseconds */
    public songStartedAt: number | null;

    /** Timestamp of the last time the Round was interacted with in epoch milliseconds */
    public lastActive: number;

    /** Timestamp of when the round's timer started in epoch milliseconds */
    public timerStartedAt: number;

    /**  Whether the round has ended */
    public finished: boolean;

    /** List of players who have opted to skip the current Round */
    public skippers: Set<string>;

    /** Whether the Round has been skipped */
    public skipAchieved: boolean;

    /** Interactable components attached to this round's message */
    public interactionComponents: Array<ButtonActionRow>;

    /** The message containing this round's interactable components */
    public interactionMessage: Eris.Message<Eris.TextableChannel> | null;

    /** Whether the data shown in the message has changed since it was last updated */
    public interactionMessageNeedsUpdate: boolean;

    constructor(song: QueriedSong, guildID: string) {
        this.song = song;
        this.songAliases = State.aliases.song[song.youtubeLink] || [];
        const artistNames = song.artistName.split("+").map((x) => x.trim());
        this.artistAliases = artistNames.flatMap(
            (x) => State.aliases.artist[x] || [],
        );
        this.startedAt = Date.now();
        this.songStartedAt = null;
        this.lastActive = Date.now();
        this.timerStartedAt = Date.now();
        this.finished = false;
        this.interactionMessage = null;
        this.interactionMessageNeedsUpdate = false;
        this.skippers = new Set();
        this.skipAchieved = false;
        this.interactionComponents = [];
        this.guildID = guildID;
    }

    abstract getEndRoundDescription(
        messageContext: MessageContext,
        uniqueSongCounter: UniqueSongCounter,
        playerRoundResults: Array<PlayerRoundResult>,
        isHidden?: boolean,
    ): string;

    abstract getEndRoundColor(
        correctGuess: boolean,
        userBonusActive: boolean,
    ): number | null;

    abstract isValidInteraction(interactionID: string): boolean;

    /**
     * Adds a skip vote for the specified user
     * @param userID - the Discord user ID of the player skipping
     */
    userSkipped(userID: string): void {
        this.skippers.add(userID);
    }

    /**
     * Gets the number of players who have opted to skip the Round
     * @returns the number of skippers
     */
    getSkipCount(): number {
        return this.skippers.size;
    }

    /**
     * Fetches the seek location for the song by the seek type
     * @param seekType - where in the song to play from
     * @param songDuration - the duration of the song in seconds
     * @param isGodMode - hardcodes the seek location
     * @param _clipAction - unused
     * @returns the seek location
     */
    prepareSeekLocation(
        seekType: SeekType,
        songDuration: number,
        isGodMode: boolean,
        _clipAction: ClipAction | null = null,
    ): number {
        if (isGodMode) {
            return 70;
        }

        let seekLocation = 0;

        switch (seekType) {
            case SeekType.BEGINNING:
                seekLocation = 0;
                break;
            case SeekType.MIDDLE:
                // Play from [0.4, 0.6]
                seekLocation = songDuration * (0.4 + 0.2 * Math.random());
                break;
            case SeekType.RANDOM:
            default:
                // Play from [0, 0.6]
                seekLocation = songDuration * (0.6 * Math.random());
                break;
        }

        return seekLocation;
    }

    async interactionSuccessfulSkip(): Promise<void> {
        if (!this.interactionMessage) return;
        this.interactionComponents = this.interactionComponents.map((x) => ({
            type: Eris.Constants.ComponentTypes.ACTION_ROW,
            components: x.components.map((y: Eris.InteractionButton) => ({
                ...y,
                style: y.custom_id.startsWith(SKIP_BUTTON_PREFIX)
                    ? Eris.Constants.ButtonStyles.SUCCESS
                    : y.style,
                disabled: y.custom_id.startsWith(SKIP_BUTTON_PREFIX),
            })),
        }));

        try {
            await this.interactionMessage.edit({
                embeds: this.interactionMessage.embeds,
                components: this.interactionComponents,
            });
        } catch (e) {
            logger.warn(
                `Error editing interactionSuccessfulSkip interaction. gid = ${this.interactionMessage.guildID}. e = ${e}}`,
            );
        }
    }

    protected getUniqueSongCounterMessage(
        messageContext: MessageContext,
        uniqueSongCounter: UniqueSongCounter,
    ): string {
        if (uniqueSongCounter.uniqueSongsPlayed === 0) {
            return "";
        }

        const uniqueSongMessage = i18n.translate(
            messageContext.guildID,
            "misc.inGame.uniqueSongsPlayed",
            {
                uniqueSongCount: codeLine(
                    `${friendlyFormattedNumber(
                        uniqueSongCounter.uniqueSongsPlayed,
                    )}/${friendlyFormattedNumber(
                        uniqueSongCounter.totalSongs,
                    )}`,
                ),
            },
        );

        return `\n${uniqueSongMessage}`;
    }
}
