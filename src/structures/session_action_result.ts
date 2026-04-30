/**
 * Result type for session actions, providing typed success/failure
 * information to command callers without exposing internal state.
 */
export type SessionActionResult<T = void> =
    | { ok: true; value: T }
    | { ok: false; reason: string };

/** Helper to create a success result */
export function actionOk<T>(value: T): SessionActionResult<T> {
    return { ok: true, value };
}

/** Helper to create a success result with void value */
export function actionOkVoid(): SessionActionResult<void> {
    return { ok: true, value: undefined };
}

/** Helper to create a failure result */
export function actionFail<T = void>(reason: string): SessionActionResult<T> {
    return { ok: false, reason };
}
