import type { SessionState } from "./session_state";

/** All events a session can emit. */
export interface SessionEvents {
    /** Fired when a round starts (after song begins playing) */
    roundStart: { roundNumber: number };

    /** Fired when a round ends */
    roundEnd: { roundNumber: number; trigger: string };

    /** Fired when the session state changes */
    stateChange: { from: SessionState; to: SessionState };

    /** Fired when the session ends */
    sessionEnd: { reason: string };
}
