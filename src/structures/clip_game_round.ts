import ClipAction from "../enums/clip_action.js";
import GameRound from "./game_round.js";
import type QueriedSong from "./queried_song.js";
import type SeekType from "../enums/option_types/seek_type.js";

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

    /**
     * Fetches the seek location for the song by the seek type and stores it
     * @param seekType - where in the song to play from
     * @param songDuration - the duration of the song in seconds
     * @param isGodMode - hardcodes the seek location
     * @param clipAction - whether a clip is being replayed or a new one is being played
     * @returns the seek location
     */
    prepareSeekLocation(
        seekType: SeekType,
        songDuration: number,
        isGodMode: boolean,
        clipAction: ClipAction | null,
    ): number {
        let seekLocation = super.prepareSeekLocation(
            seekType,
            songDuration,
            isGodMode,
        );

        if (isGodMode) {
            return seekLocation;
        }

        if (clipAction && clipAction !== ClipAction.NEW_CLIP) {
            // Set to the previous play's seek location if replaying
            seekLocation = this.seekLocation!;
        } else {
            // We enter here when the round is first started in clip mode
            // Ignore seek above and play from [0.2, 0.8]
            seekLocation = songDuration * (0.2 + 0.6 * Math.random());
        }

        this.seekLocation = seekLocation;
        return seekLocation;
    }
}
