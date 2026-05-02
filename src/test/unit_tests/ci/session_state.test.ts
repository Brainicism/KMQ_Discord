import assert from "assert";

import {
    SessionState,
    SessionStateMachine,
} from "../../../structures/session_state";

describe("SessionStateMachine", () => {
    let sm: SessionStateMachine;

    beforeEach(() => {
        sm = new SessionStateMachine("test-guild");
    });

    describe("initial state", () => {
        it("should start in CREATED state", () => {
            assert.strictEqual(sm.state, SessionState.CREATED);
        });
    });

    describe("valid transitions", () => {
        it("CREATED → INITIALIZING should succeed", () => {
            assert.strictEqual(sm.transition(SessionState.INITIALIZING), true);
            assert.strictEqual(sm.state, SessionState.INITIALIZING);
        });

        it("INITIALIZING → ROUND_ACTIVE should succeed", () => {
            sm.transition(SessionState.INITIALIZING);
            assert.strictEqual(sm.transition(SessionState.ROUND_ACTIVE), true);
            assert.strictEqual(sm.state, SessionState.ROUND_ACTIVE);
        });

        it("CREATED → LOBBY should succeed", () => {
            assert.strictEqual(sm.transition(SessionState.LOBBY), true);
            assert.strictEqual(sm.state, SessionState.LOBBY);
        });

        it("INITIALIZING → BETWEEN_ROUNDS should succeed", () => {
            sm.transition(SessionState.INITIALIZING);
            assert.strictEqual(
                sm.transition(SessionState.BETWEEN_ROUNDS),
                true,
            );
        });

        it("ROUND_ACTIVE → ROUND_ENDING should succeed", () => {
            sm.transition(SessionState.INITIALIZING);
            sm.transition(SessionState.ROUND_ACTIVE);
            assert.strictEqual(sm.transition(SessionState.ROUND_ENDING), true);
        });

        it("ROUND_ENDING → BETWEEN_ROUNDS should succeed", () => {
            sm.transition(SessionState.INITIALIZING);
            sm.transition(SessionState.ROUND_ACTIVE);
            sm.transition(SessionState.ROUND_ENDING);
            assert.strictEqual(
                sm.transition(SessionState.BETWEEN_ROUNDS),
                true,
            );
        });

        it("BETWEEN_ROUNDS → ROUND_ACTIVE should succeed", () => {
            sm.transition(SessionState.INITIALIZING);
            sm.transition(SessionState.BETWEEN_ROUNDS);
            assert.strictEqual(sm.transition(SessionState.ROUND_ACTIVE), true);
        });

        it("ENDING → ENDED should succeed", () => {
            sm.transition(SessionState.INITIALIZING);
            sm.transition(SessionState.ENDING);
            assert.strictEqual(sm.transition(SessionState.ENDED), true);
        });

        it("full round lifecycle should work", () => {
            sm.transition(SessionState.INITIALIZING);
            sm.transition(SessionState.ROUND_ACTIVE);
            sm.transition(SessionState.ROUND_ENDING);
            sm.transition(SessionState.BETWEEN_ROUNDS);
            sm.transition(SessionState.ROUND_ACTIVE);
            sm.transition(SessionState.ROUND_ENDING);
            sm.transition(SessionState.ENDING);
            sm.transition(SessionState.ENDED);
            assert.strictEqual(sm.state, SessionState.ENDED);
        });

        it("teams mode lifecycle should work (CREATED → LOBBY → INITIALIZING → ROUND_ACTIVE)", () => {
            assert.strictEqual(sm.transition(SessionState.LOBBY), true);
            assert.strictEqual(sm.state, SessionState.LOBBY);
            assert.strictEqual(sm.transition(SessionState.INITIALIZING), true);
            assert.strictEqual(sm.state, SessionState.INITIALIZING);
            assert.strictEqual(sm.transition(SessionState.ROUND_ACTIVE), true);
            assert.strictEqual(sm.state, SessionState.ROUND_ACTIVE);
            sm.transition(SessionState.ROUND_ENDING);
            sm.transition(SessionState.ENDING);
            sm.transition(SessionState.ENDED);
            assert.strictEqual(sm.state, SessionState.ENDED);
        });
    });

    describe("invalid transitions", () => {
        it("CREATED → ROUND_ACTIVE should fail", () => {
            assert.strictEqual(sm.transition(SessionState.ROUND_ACTIVE), false);
        });

        it("ENDED → anything should fail", () => {
            sm.transition(SessionState.INITIALIZING);
            sm.transition(SessionState.ENDING);
            sm.transition(SessionState.ENDED);
            assert.strictEqual(sm.transition(SessionState.CREATED), false);
        });

        it("ROUND_ACTIVE → BETWEEN_ROUNDS should fail (must go through ROUND_ENDING)", () => {
            sm.transition(SessionState.INITIALIZING);
            sm.transition(SessionState.ROUND_ACTIVE);
            assert.strictEqual(
                sm.transition(SessionState.BETWEEN_ROUNDS),
                false,
            );
        });

        it("BETWEEN_ROUNDS → ROUND_ENDING should fail", () => {
            sm.transition(SessionState.INITIALIZING);
            sm.transition(SessionState.BETWEEN_ROUNDS);
            assert.strictEqual(sm.transition(SessionState.ROUND_ENDING), false);
        });

        it("INITIALIZING → LOBBY should fail (LOBBY comes before INITIALIZING)", () => {
            sm.transition(SessionState.INITIALIZING);
            assert.strictEqual(sm.transition(SessionState.LOBBY), false);
        });
    });

    describe("emergency transitions to ENDING", () => {
        const statesWithEndingTransition = [
            SessionState.INITIALIZING,
            SessionState.LOBBY,
            SessionState.BETWEEN_ROUNDS,
            SessionState.ROUND_ACTIVE,
            SessionState.ROUND_ENDING,
        ];

        for (const state of statesWithEndingTransition) {
            it(`${state} → ENDING should succeed`, () => {
                const fresh = new SessionStateMachine("test");
                // Navigate to the target state
                if (state === SessionState.LOBBY) {
                    fresh.transition(SessionState.LOBBY);
                } else if (state === SessionState.INITIALIZING) {
                    fresh.transition(SessionState.INITIALIZING);
                } else if (state === SessionState.BETWEEN_ROUNDS) {
                    fresh.transition(SessionState.INITIALIZING);
                    fresh.transition(SessionState.BETWEEN_ROUNDS);
                } else if (state === SessionState.ROUND_ACTIVE) {
                    fresh.transition(SessionState.INITIALIZING);
                    fresh.transition(SessionState.ROUND_ACTIVE);
                } else if (state === SessionState.ROUND_ENDING) {
                    fresh.transition(SessionState.INITIALIZING);
                    fresh.transition(SessionState.ROUND_ACTIVE);
                    fresh.transition(SessionState.ROUND_ENDING);
                }

                assert.strictEqual(fresh.transition(SessionState.ENDING), true);
            });
        }

        it("CREATED → ENDING should succeed", () => {
            assert.strictEqual(sm.transition(SessionState.ENDING), true);
        });
    });

    describe("convenience getters", () => {
        it("isAlive should be true for active states", () => {
            assert.strictEqual(sm.isAlive, true);
            sm.transition(SessionState.INITIALIZING);
            assert.strictEqual(sm.isAlive, true);
        });

        it("isAlive should be false for ENDING and ENDED", () => {
            sm.transition(SessionState.INITIALIZING);
            sm.transition(SessionState.ENDING);
            assert.strictEqual(sm.isAlive, false);
            sm.transition(SessionState.ENDED);
            assert.strictEqual(sm.isAlive, false);
        });

        it("isAcceptingInput should only be true in ROUND_ACTIVE", () => {
            assert.strictEqual(sm.isAcceptingInput, false);
            sm.transition(SessionState.INITIALIZING);
            assert.strictEqual(sm.isAcceptingInput, false);
            sm.transition(SessionState.ROUND_ACTIVE);
            assert.strictEqual(sm.isAcceptingInput, true);
            sm.transition(SessionState.ROUND_ENDING);
            assert.strictEqual(sm.isAcceptingInput, false);
        });

        it("isRoundCapable should be true for ROUND_ACTIVE and ROUND_ENDING", () => {
            sm.transition(SessionState.INITIALIZING);
            assert.strictEqual(sm.isRoundCapable, false);
            sm.transition(SessionState.ROUND_ACTIVE);
            assert.strictEqual(sm.isRoundCapable, true);
            sm.transition(SessionState.ROUND_ENDING);
            assert.strictEqual(sm.isRoundCapable, true);
            sm.transition(SessionState.BETWEEN_ROUNDS);
            assert.strictEqual(sm.isRoundCapable, false);
        });
    });

    describe("canTransition", () => {
        it("should return true for valid transitions without changing state", () => {
            assert.strictEqual(
                sm.canTransition(SessionState.INITIALIZING),
                true,
            );
            assert.strictEqual(sm.state, SessionState.CREATED);
        });

        it("should return false for invalid transitions", () => {
            assert.strictEqual(
                sm.canTransition(SessionState.ROUND_ACTIVE),
                false,
            );
        });
    });
});
