import { getMajorityCount } from "../helpers/discord_utils";
import ClipAction from "../enums/clip_action";
import GameRound from "./game_round";
import type QueriedSong from "./queried_song";

export default class ClipGameRound extends GameRound {
    /** The location of where the song was started */
    public seekLocation: number | null;

    /** List of players who have voted to replay the current song */
    public replayRequesters: Set<string>;

    /** List of players who have voted for a new clip of the current song */
    public newClipRequesters: Set<string>;

    /** The Discord Guild ID */
    public readonly guildID: string;

    constructor(song: QueriedSong, baseExp: number, guildID: string) {
        super(song, baseExp);

        this.seekLocation = null;
        this.replayRequesters = new Set();
        this.newClipRequesters = new Set();
        this.guildID = guildID;
    }

    /**
     * @param interactionID - the ID of an interaction
     * @returns if the ID is a valid action
     */
    isValidInteraction(interactionID: string): boolean {
        return (
            super.isValidInteraction(interactionID) ||
            Object.values(ClipAction).includes(interactionID as ClipAction)
        );
    }

    /**
     * Adds a replay vote for the specified user
     * @param userID - the Discord user ID of the player requesting a replay
     */
    replayRequested(userID: string): void {
        this.replayRequesters.add(userID);
    }

    /**
     * Adds a new clip vote for the specified user
     * @param userID - the Discord user ID of the player requesting a new clip
     */
    newClipRequested(userID: string): void {
        this.newClipRequesters.add(userID);
    }

    /**
     * @returns if the song should be replayed
     */
    isReplayMajority(): boolean {
        return this.replayRequesters.size >= getMajorityCount(this.guildID);
    }

    /**
     * @returns if the song should have a new clip
     */
    isNewClipMajority(): boolean {
        return this.newClipRequesters.size >= getMajorityCount(this.guildID);
    }

    /**
     * @returns a formatted string of the replay vote count
     */
    replayVoteCounter(): string {
        return `${this.replayRequesters.size}/${getMajorityCount(this.guildID)}`;
    }

    /**
     * @returns a formatted string of the new clip vote count
     */
    newClipVoteCounter(): string {
        return `${this.newClipRequesters.size}/${getMajorityCount(this.guildID)}`;
    }

    /**
     * Resets the requesters for replay and new clip
     */
    resetRequesters(): void {
        this.replayRequesters.clear();
        this.newClipRequesters.clear();
    }
}
