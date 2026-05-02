import {
    type SessionActionResult,
    SessionRejectReason,
    actionFail,
    actionOk,
    actionOkVoid,
} from "../../../structures/session_action_result";
import assert from "assert";

describe("SessionActionResult", () => {
    describe("actionOk", () => {
        it("should create a success result with value", () => {
            const result = actionOk(42);
            assert.strictEqual(result.ok, true);
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            if (result.ok) {
                assert.strictEqual(result.value, 42);
            }
        });

        it("should work with complex types", () => {
            const result = actionOk({
                skipAchieved: true,
                skipCount: 3,
                skipThreshold: 3,
            });

            assert.strictEqual(result.ok, true);
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            if (result.ok) {
                assert.strictEqual(result.value.skipAchieved, true);
                assert.strictEqual(result.value.skipCount, 3);
            }
        });
    });

    describe("actionOkVoid", () => {
        it("should create a success result with undefined value", () => {
            const result = actionOkVoid();
            assert.strictEqual(result.ok, true);
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            if (result.ok) {
                assert.strictEqual(result.value, undefined);
            }
        });
    });

    describe("actionFail", () => {
        it("should create a failure result with reason", () => {
            const result = actionFail(SessionRejectReason.NO_ACTIVE_ROUND);
            assert.strictEqual(result.ok, false);
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            if (!result.ok) {
                assert.strictEqual(
                    result.reason,
                    SessionRejectReason.NO_ACTIVE_ROUND,
                );
            }
        });
    });

    describe("type narrowing", () => {
        it("should narrow correctly on ok check", () => {
            const result: SessionActionResult<number> = actionOk(10);
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            if (result.ok) {
                const val: number = result.value;
                assert.strictEqual(val, 10);
            } else {
                assert.fail("Expected ok result");
            }
        });

        it("should narrow correctly on failure check", () => {
            const result: SessionActionResult<number> = actionFail(
                SessionRejectReason.SESSION_ENDED,
            );

            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            if (!result.ok) {
                const reason: SessionRejectReason = result.reason;
                assert.strictEqual(reason, "session_ended");
            } else {
                assert.fail("Expected failure result");
            }
        });
    });
});
