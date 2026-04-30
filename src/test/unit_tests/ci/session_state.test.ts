import {
    SessionState,
    SessionStateMachine,
} from "../../../structures/session_state";
import assert from "assert";

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

        it("INITIALIZING → ROUND_STARTING should succeed", () => {
            sm.transition(SessionState.INITIALIZING);
            assert.strictEqual(
                sm.transition(SessionState.ROUND_STARTING),
                true,
            );
            assert.strictEqual(sm.state, SessionState.ROUND_STARTING);
        });

        it("INITIALIZING → LOBBY should succeed", () => {
            sm.transition(SessionState.INITIALIZING);
            assert.strictEqual(sm.transition(SessionState.LOBBY), true);
        });

        it("INITIALIZING → BETWEEN_ROUNDS should succeed", () => {
            sm.transition(SessionState.INITIALIZING);
            assert.strictEqual(
                sm.transition(SessionState.BETWEEN_ROUNDS),
                true,
            );
        });

        it("ROUND_STARTING → ROUND_ACTIVE should succeed", () => {
            sm.transition(SessionState.INITIALIZING);
            sm.transition(SessionState.ROUND_STARTING);
            assert.strictEqual(
                sm.transition(SessionState.ROUND_ACTIVE),
                true,
            );
        });

        it("ROUND_ACTIVE → ROUND_ENDING should succeed", () => {
            sm.transition(SessionState.INITIALIZING);
            sm.transition(SessionState.ROUND_STARTING);
            sm.transition(SessionState.ROUND_ACTIVE);
            assert.strictEqual(
                sm.transition(SessionState.ROUND_ENDING),
                true,
            );
        });

        it("ROUND_ENDING → BETWEEN_ROUNDS should succeed", () => {
            sm.transition(SessionState.INITIALIZING);
            sm.transition(SessionState.ROUND_STARTING);
            sm.transition(SessionState.ROUND_ACTIVE);
            sm.transition(SessionState.ROUND_ENDING);
            assert.strictEqual(
                sm.transition(SessionState.BETWEEN_ROUNDS),
                true,
            );
        });

        it("BETWEEN_ROUNDS → ROUND_STARTING should succeed", () => {
            sm.transition(SessionState.INITIALIZING);
            sm.transition(SessionState.BETWEEN_ROUNDS);
            assert.strictEqual(
                sm.transition(SessionState.ROUND_STARTING),
                true,
            );
        });

        it("ENDING → ENDED should succeed", () => {
            sm.transition(SessionState.INITIALIZING);
            sm.transition(SessionState.ENDING);
            assert.strictEqual(sm.transition(SessionState.ENDED), true);
        });

        it("full round lifecycle should work", () => {
            sm.transition(SessionState.INITIALIZING);
            sm.transition(SessionState.ROUND_STARTING);
            sm.transition(SessionState.ROUND_ACTIVE);
            sm.transition(SessionState.ROUND_ENDING);
            sm.transition(SessionState.BETWEEN_ROUNDS);
            sm.transition(SessionState.ROUND_STARTING);
            sm.transition(SessionState.ROUND_ACTIVE);
            sm.transition(SessionState.ROUND_ENDING);
            sm.transition(SessionState.ENDING);
            sm.transition(SessionState.ENDED);
            assert.strictEqual(sm.state, SessionState.ENDED);
        });
    });

    describe("invalid transitions", () => {
        it("CREATED → ROUND_ACTIVE should fail", () => {
            assert.strictEqual(
                sm.transition(SessionState.ROUND_ACTIVE),
                false,
            );
            assert.strictEqual(sm.state, SessionState.CREATED);
        });

        it("ENDED → anything should fail", () => {
            sm.transition(SessionState.INITIALIZING);
            sm.transition(SessionState.ENDING);
            sm.transition(SessionState.ENDED);
            assert.strictEqual(sm.transition(SessionState.CREATED), false);
            assert.strictEqual(sm.state, SessionState.ENDED);
        });

        it("ROUND_ACTIVE → ROUND_STARTING should fail", () => {
            sm.transition(SessionState.INITIALIZING);
            sm.transition(SessionState.ROUND_STARTING);
            sm.transition(SessionState.ROUND_ACTIVE);
            assert.strictEqual(
                sm.transition(SessionState.ROUND_STARTING),
                false,
            );
            assert.strictEqual(sm.state, SessionState.ROUND_ACTIVE);
        });

        it("BETWEEN_ROUNDS → ROUND_ACTIVE should fail (must go through ROUND_STARTING)", () => {
            sm.transition(SessionState.INITIALIZING);
            sm.transition(SessionState.BETWEEN_ROUNDS);
            assert.strictEqual(
                sm.transition(SessionState.ROUND_ACTIVE),
                false,
            );
        });
    });

    describe("emergency transitions to ENDING", () => {
        const statesWithEndingTransition = [
            SessionState.INITIALIZING,
            SessionState.LOBBY,
            SessionState.BETWEEN_ROUNDS,
            SessionState.ROUND_STARTING,
            SessionState.ROUND_ACTIVE,
            SessionState.ROUND_ENDING,
        ];

        for (const state of statesWithEndingTransition) {
            it(`${state} → ENDING should succeed`, () => {
                const fresh = new SessionStateMachine("test");
                fresh.transition(SessionState.INITIALIZING);
                // Navigate to the target state
                if (state === SessionState.LOBBY) {
                    fresh.transition(SessionState.LOBBY);
                } else if (state === SessionState.BETWEEN_ROUNDS) {
                    fresh.transition(SessionState.BETWEEN_ROUNDS);
                } else if (state === SessionState.ROUND_STARTING) {
                    fresh.transition(SessionState.ROUND_STARTING);
                } else if (state === SessionState.ROUND_ACTIVE) {
                    fresh.transition(SessionState.ROUND_STARTING);
                    fresh.transition(SessionState.ROUND_ACTIVE);
                } else if (state === SessionState.ROUND_ENDING) {
                    fresh.transition(SessionState.ROUND_STARTING);
                    fresh.transition(SessionState.ROUND_ACTIVE);
                    fresh.transition(SessionState.ROUND_ENDING);
                }

                // INITIALIZING is already the state after first transition
                assert.strictEqual(fresh.transition(SessionState.ENDING), true);
            });
        }

        it("CREATED → ENDING should fail (not in transition table)", () => {
            assert.strictEqual(sm.transition(SessionState.ENDING), false);
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
            sm.transition(SessionState.ROUND_STARTING);
            assert.strictEqual(sm.isAcceptingInput, false);
            sm.transition(SessionState.ROUND_ACTIVE);
            assert.strictEqual(sm.isAcceptingInput, true);
            sm.transition(SessionState.ROUND_ENDING);
            assert.strictEqual(sm.isAcceptingInput, false);
        });

        it("isRoundCapable should be true for ROUND_STARTING, ROUND_ACTIVE, ROUND_ENDING", () => {
            sm.transition(SessionState.INITIALIZING);
            sm.transition(SessionState.ROUND_STARTING);
            assert.strictEqual(sm.isRoundCapable, true);
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
