import { getMajorityCount } from "../helpers/discord_utils";
import ClipAction from "../enums/clip_action";
import GameRound from "./game_round";
import type QueriedSong from "./queried_song";

export default class ClipGameRound extends GameRound {
    /** The location of where the song was started */
    public seekLocation: number | null;

    /** The timestamp of the first time this clip was played */
    public clipStartedAt: number | null;

    /** List of players who have voted for a new clip of the current song */
    private newClipRequesters: Set<string>;

    /** The number of times the song has been replayed */
    private replays: number;

    constructor(song: QueriedSong, baseExp: number, guildID: string) {
        super(song, baseExp, guildID);
        this.seekLocation = null;
        this.clipStartedAt = null;
        this.newClipRequesters = new Set();
        this.replays = 0;
    }

    /**
     * @param interactionID - the ID of an interaction
     * @returns if the ID is a valid action
     */
    isValidInteraction(interactionID: string): boolean {
        return (
            super.isValidInteraction(interactionID) ||
            interactionID === ClipAction.NEW_CLIP
        );
    }

    /**
     * Adds a new clip vote for the specified user
     * @param userID - the Discord user ID of the player requesting a new clip
     */
    newClipRequested(userID: string): void {
        this.newClipRequesters.add(userID);
    }

    /**
     * @returns if the song should have a new clip
     */
    isNewClipMajority(): boolean {
        return this.newClipRequesters.size >= getMajorityCount(this.guildID);
    }

    /**
     * @returns a formatted string of the new clip vote count
     */
    newClipVoteCounter(): string {
        return `${this.newClipRequesters.size}/${getMajorityCount(this.guildID)}`;
    }

    /**
     * Increments the replay count
     */
    incrementReplays(): void {
        this.replays++;
    }

    /**
     * @returns the number of replays
     */
    getReplayCount(): number {
        return this.replays;
    }

    /**
     * Resets the requesters for new clip and replays
     */
    reset(): void {
        this.newClipRequesters.clear();
        this.replays = 0;
    }
}
