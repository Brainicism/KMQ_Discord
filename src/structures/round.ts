import { PlayerRoundResult, QueriedSong } from "../types";
import { state } from "../kmq_worker";
import { UniqueSongCounter } from "./song_selector";
import MessageContext from "./message_context";

export const MAX_RUNNERS_UP = 30;
export const MAX_SCOREBOARD_PLAYERS = 30;

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
    public endRoundMessageID: string;

    /** List of players who have opted to skip the current Round */
    public skippers: Set<string>;

    /** Whether the Round has been skipped */
    public skipAchieved: boolean;

    constructor(song: QueriedSong) {
        this.song = song;
        this.songAliases = state.aliases.song[song.youtubeLink] || [];
        const artistNames = song.artistName.split("+").map((x) => x.trim());
        this.artistAliases = artistNames.flatMap(
            (x) => state.aliases.artist[x] || []
        );
        this.startedAt = Date.now();
        this.endRoundMessageID = null;
        this.skippers = new Set();
        this.skipAchieved = false;
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
}
