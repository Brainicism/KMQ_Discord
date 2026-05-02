/**
 * Typed reasons for rejecting a session action.
 */
export enum SessionRejectReason {
    NO_ACTIVE_ROUND = "no_active_round",
    NOT_ACCEPTING_INPUT = "not_accepting_input",
    SESSION_ENDED = "session_ended",
}

/**
 * Result type for session actions, providing typed success/failure
 * information to command callers without exposing internal state.
 */
export type SessionActionResult<T = void> =
    | { ok: true; value: T }
    | { ok: false; reason: SessionRejectReason };

/**
 * Helper to create a success result
 * @param value - The success payload
 * @returns A success SessionActionResult containing the value
 */
export function actionOk<T>(value: T): SessionActionResult<T> {
    return { ok: true, value };
}

/**
 * Helper to create a success result with void value
 * @returns A success SessionActionResult with undefined value
 */
export function actionOkVoid(): SessionActionResult<void> {
    return { ok: true, value: undefined };
}

/**
 * Helper to create a failure result
 * @param reason - The rejection reason
 * @returns A failure SessionActionResult containing the reason
 */
export function actionFail<T = void>(
    reason: SessionRejectReason,
): SessionActionResult<T> {
    return { ok: false, reason };
}
