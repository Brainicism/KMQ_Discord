import GameRound from "./game_round";
import type QueriedSong from "./queried_song";

export default class ClipGameRound extends GameRound {
    /** The location of where the song was started */
    public seekLocation: number | null;

    /** The number of times the song has been replayed */
    private replays: number;

    constructor(song: QueriedSong, baseExp: number, guildID: string) {
        super(song, baseExp, guildID);
        this.seekLocation = null;
        this.replays = 0;
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
}
