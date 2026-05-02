import type ActivityRoundMeta from "./activity_round_meta";
import type ActivityScoreboardSnapshot from "./activity_scoreboard_snapshot";
import type ActivitySessionMeta from "./activity_session_meta";

export default interface ActivitySnapshot {
    hasSession: boolean;
    session?: ActivitySessionMeta;
    scoreboard?: ActivityScoreboardSnapshot;
    currentRound?: ActivityRoundMeta;
}
