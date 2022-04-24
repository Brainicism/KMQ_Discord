import { codeLine, friendlyFormattedNumber } from "../helpers/utils";
import LocalizationManager from "../helpers/localization_manager";
import State from "../state";
import type Eris from "eris";
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

    /** Timestamp of the last time the Round was interacted with in epoch milliseconds */
    public lastActive: number;

    /**  Whether the round has ended */
    public finished: boolean;

    /**  The Discord ID of the end round message */
    public roundMessageID: string;

    /** List of players who have opted to skip the current Round */
    public skippers: Set<string>;

    /** Whether the Round has been skipped */
    public skipAchieved: boolean;

    /** Interactable components attached to this round's message */
    public interactionComponents: Array<Eris.ActionRow>;

    /** The message containing this round's interactable components */
    public interactionMessage: Eris.Message<Eris.TextableChannel>;

    constructor(song: QueriedSong) {
        this.song = song;
        this.songAliases = State.aliases.song[song.youtubeLink] || [];
        const artistNames = song.artistName.split("+").map((x) => x.trim());
        this.artistAliases = artistNames.flatMap(
            (x) => State.aliases.artist[x] || []
        );
        this.startedAt = Date.now();
        this.roundMessageID = null;
        this.skippers = new Set();
        this.skipAchieved = false;
        this.interactionComponents = [];
    }

    abstract getEndRoundDescription(
        messageContext: MessageContext,
        uniqueSongCounter: UniqueSongCounter,
        playerRoundResults: Array<PlayerRoundResult>
    ): string;

    abstract getEndRoundColor(
        correctGuess: boolean,
        userBonusActive: boolean
    ): number;

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

    // eslint-disable-next-line class-methods-use-this
    protected getUniqueSongCounterMessage(
        messageContext: MessageContext,
        uniqueSongCounter: UniqueSongCounter
    ): string {
        if (!uniqueSongCounter || uniqueSongCounter.uniqueSongsPlayed === 0) {
            return "";
        }

        const uniqueSongMessage = LocalizationManager.localizer.translate(
            messageContext.guildID,
            "misc.inGame.uniqueSongsPlayed",
            {
                uniqueSongCount: codeLine(
                    `${friendlyFormattedNumber(
                        uniqueSongCounter.uniqueSongsPlayed
                    )}/${friendlyFormattedNumber(uniqueSongCounter.totalSongs)}`
                ),
            }
        );

        return `\n${uniqueSongMessage}`;
    }
}
