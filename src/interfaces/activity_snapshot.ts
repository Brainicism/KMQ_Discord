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
     * Web rooms only. The stream URL for audio already playing, injected by
     * the admiral (never the worker) so reconnects and late joiners hear the
     * current song; each GET re-seeks to the live position.
     */
    currentAudio?: {
        audioUrl: string;
        playbackDurationSec: number;
    };
    /**
     * Present while a bot restart has been announced and not yet retracted.
     * Injected by the admiral (workers never set it) so late joiners and
     * reconnects see the warning between broadcast intervals.
     */
    restartWarning?: {
        restartsAtEpochMs: number;
    };
    /** Current GuildPreference values the Activity panel needs. */
    options: ActivityOptionsSnapshot;
}
