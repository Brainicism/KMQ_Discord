import { codeLine, friendlyFormattedNumber } from "../helpers/utils";
import State from "../state";
import i18n from "../helpers/localization_manager";
import type { ButtonActionRow } from "../types";
import type Eris from "eris";
import type GameType from "../enums/game_type";
import type MessageContext from "./message_context";
import type PlayerRoundResult from "../interfaces/player_round_result";
import type QueriedSong from "../interfaces/queried_song";
import type UniqueSongCounter from "../interfaces/unique_song_counter";

export default abstract class Round {
    /** The song associated with the round */
    public readonly song: QueriedSong;

    /** The potential song aliases */
    public readonly songAliases: string[];

    /** The potential artist aliases */
    public readonly artistAliases: string[];

    /** Timestamp of the creation of the Round in epoch milliseconds */
    public readonly startedAt: number;

    /** Timestamp of when the song started playing in epoch milliseconds */
    public songStartedAt: number;

    /** Timestamp of the last time the Round was interacted with in epoch milliseconds */
    public lastActive: number;

    /** Timestamp of when the round's timer started in epoch milliseconds */
    public timerStartedAt: number;

    /**  Whether the round has ended */
    public finished: boolean;

    /**  The Discord ID of the end round message */
    public roundMessageID: string | null;

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

    constructor(song: QueriedSong) {
        this.song = song;
        this.songAliases = State.aliases.song[song.youtubeLink] || [];
        const artistNames = song.artistName.split("+").map((x) => x.trim());
        this.artistAliases = artistNames.flatMap(
            (x) => State.aliases.artist[x] || [],
        );
        this.startedAt = Date.now();
        this.songStartedAt = Date.now();
        this.lastActive = Date.now();
        this.timerStartedAt = Date.now();
        this.finished = false;
        this.interactionMessage = null;
        this.interactionMessageNeedsUpdate = false;
        this.roundMessageID = null;
        this.skippers = new Set();
        this.skipAchieved = false;
        this.interactionComponents = [];
    }

    abstract getEndRoundDescription(
        messageContext: MessageContext,
        uniqueSongCounter: UniqueSongCounter,
        playerRoundResults: Array<PlayerRoundResult>,
        gameType?: GameType,
    ): string;

    abstract getEndRoundColor(
        correctGuess: boolean,
        userBonusActive: boolean,
    ): number | null;

    abstract isValidInteraction(interactionUUID: string): boolean;

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

    protected getUniqueSongCounterMessage(
        messageContext: MessageContext,
        uniqueSongCounter: UniqueSongCounter,
    ): string {
        if (!uniqueSongCounter || uniqueSongCounter.uniqueSongsPlayed === 0) {
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
