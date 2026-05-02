import type ActivityRequestRejection from "../enums/activity_request_rejection";

export default interface ActivityGuessResponse {
    ok: boolean;
    reason?: ActivityRequestRejection;
}
