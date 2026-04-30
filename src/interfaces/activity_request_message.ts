import type ActivityBookmarkArgs from "./activity_bookmark_args";
import type ActivityGuessArgs from "./activity_guess_args";
import type ActivityRequestOp from "../enums/activity_request_op";
import type ActivitySnapshotArgs from "./activity_snapshot_args";
import type ActivityStartGameArgs from "./activity_start_game_args";
import type ActivityUserActionArgs from "./activity_user_action_args";

export default interface ActivityRequestMessage {
    cid: string;
    op: ActivityRequestOp;
    args:
        | ActivitySnapshotArgs
        | ActivityGuessArgs
        | ActivityStartGameArgs
        | ActivityUserActionArgs
        | ActivityBookmarkArgs;
}
