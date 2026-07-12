import type ActivityOptionsSnapshot from "./activity_options_snapshot";
import type ActivityRoundMeta from "./activity_round_meta";
import type ActivityScoreboardSnapshot from "./activity_scoreboard_snapshot";
import type ActivitySessionMeta from "./activity_session_meta";

export default interface ActivitySnapshot {
    hasSession: boolean;
    session?: ActivitySessionMeta;
    scoreboard?: ActivityScoreboardSnapshot;
    currentRound?: ActivityRoundMeta;
    /**
     * Web rooms only: audio already playing when the snapshot was taken, so
     * reconnects and late joiners hear the current song.
     */
    currentAudio?: {
        audioUrl: string;
        playbackDurationSec: number;
    };
    options: ActivityOptionsSnapshot;
}
