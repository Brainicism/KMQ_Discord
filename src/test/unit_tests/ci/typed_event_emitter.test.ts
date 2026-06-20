import { TypedEventEmitter } from "../../../structures/typed_event_emitter";
import assert from "assert";
import type { SessionEvents } from "../../../structures/session_events";

interface TestEvents {
    greet: { name: string };
    count: { value: number };
    empty: Record<string, never>;
}

describe("TypedEventEmitter", () => {
    let emitter: TypedEventEmitter<TestEvents>;

    beforeEach(() => {
        emitter = new TypedEventEmitter<TestEvents>();
    });

    describe("on", () => {
        it("should receive emitted events with correct data", () => {
            let received: { name: string } | null = null;
            emitter.on("greet", (data) => {
                received = data;
            });
            emitter.emit("greet", { name: "Alice" });
            assert.deepStrictEqual(received, { name: "Alice" });
        });

        it("should support multiple listeners on the same event", () => {
            let count = 0;
            emitter.on("greet", () => {
                count++;
            });

            emitter.on("greet", () => {
                count++;
            });
            emitter.emit("greet", { name: "Bob" });
            assert.strictEqual(count, 2);
        });

        it("should not cross-fire between different events", () => {
            let greetFired = false;
            emitter.on("greet", () => {
                greetFired = true;
            });
            emitter.emit("count", { value: 42 });
            assert.strictEqual(greetFired, false);
        });

        it("should fire on every emit (persistent listener)", () => {
            let callCount = 0;
            emitter.on("count", () => {
                callCount++;
            });
            emitter.emit("count", { value: 1 });
            emitter.emit("count", { value: 2 });
            emitter.emit("count", { value: 3 });
            assert.strictEqual(callCount, 3);
        });
    });

    describe("once", () => {
        it("should fire only once", () => {
            let callCount = 0;
            emitter.once("greet", () => {
                callCount++;
            });
            emitter.emit("greet", { name: "Once" });
            emitter.emit("greet", { name: "Twice" });
            assert.strictEqual(callCount, 1);
        });

        it("should pass correct data on the single fire", () => {
            let received: { name: string } | null = null;
            emitter.once("greet", (data) => {
                received = data;
            });
            emitter.emit("greet", { name: "OnceData" });
            assert.deepStrictEqual(received, { name: "OnceData" });
        });
    });

    describe("emit", () => {
        it("should pass data correctly to listener", () => {
            let received: { value: number } | null = null;
            emitter.on("count", (data) => {
                received = data;
            });
            emitter.emit("count", { value: 99 });
            assert.deepStrictEqual(received, { value: 99 });
        });

        it("should not throw when no listeners are registered", () => {
            assert.doesNotThrow(() => {
                emitter.emit("greet", { name: "NoListeners" });
            });
        });
    });

    describe("off", () => {
        it("should remove a specific listener", () => {
            let called = false;
            const listener = (): void => {
                called = true;
            };

            emitter.on("greet", listener);
            emitter.off("greet", listener);
            emitter.emit("greet", { name: "Removed" });
            assert.strictEqual(called, false);
        });

        it("should not affect other listeners on the same event", () => {
            let firstCalled = false;
            let secondCalled = false;
            const firstListener = (): void => {
                firstCalled = true;
            };

            const secondListener = (): void => {
                secondCalled = true;
            };

            emitter.on("greet", firstListener);
            emitter.on("greet", secondListener);
            emitter.off("greet", firstListener);
            emitter.emit("greet", { name: "Partial" });
            assert.strictEqual(firstCalled, false);
            assert.strictEqual(secondCalled, true);
        });
    });

    describe("removeAllListeners", () => {
        it("should remove all listeners across all events", () => {
            let greetFired = false;
            let countFired = false;
            emitter.on("greet", () => {
                greetFired = true;
            });

            emitter.on("count", () => {
                countFired = true;
            });

            emitter.removeAllListeners();
            emitter.emit("greet", { name: "Cleared" });
            emitter.emit("count", { value: 0 });
            assert.strictEqual(greetFired, false);
            assert.strictEqual(countFired, false);
        });
    });

    describe("SessionEvents integration", () => {
        it("should work with SessionEvents interface for sessionEnd", () => {
            const sessionEmitter = new TypedEventEmitter<SessionEvents>();

            let received: { reason: string } | null = null;
            sessionEmitter.on("sessionEnd", (data) => {
                received = data;
            });
            sessionEmitter.emit("sessionEnd", { reason: "game_over" });
            assert.deepStrictEqual(received, { reason: "game_over" });
        });

        it("should support once for sessionEnd", () => {
            const sessionEmitter = new TypedEventEmitter<SessionEvents>();

            let callCount = 0;
            sessionEmitter.once("sessionEnd", () => {
                callCount++;
            });
            sessionEmitter.emit("sessionEnd", { reason: "first" });
            sessionEmitter.emit("sessionEnd", { reason: "second" });
            assert.strictEqual(callCount, 1);
        });
    });
});
