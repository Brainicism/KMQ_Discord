/** All events a session can emit. */
export interface SessionEvents {
    /**
     * Fired when the session ends.
     *
     * Future events (roundStart, roundEnd, stateChange) will be added
     * when the state machine integration is complete.
     */
    sessionEnd: { reason: string };
}
