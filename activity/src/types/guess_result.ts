import type GuessRejectReason from "./guess_reject_reason";

export default interface GuessResult {
    ok: boolean;
    reason?: GuessRejectReason;
}
