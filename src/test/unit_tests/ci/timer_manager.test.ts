import { TimerManager } from "../../../structures/timer_manager";
import assert from "assert";

describe("TimerManager", () => {
    let tm: TimerManager;

    beforeEach(() => {
        tm = new TimerManager();
    });

    afterEach(() => {
        tm.clearAll();
    });

    describe("set/clear", () => {
        it("should register a named timer", (done) => {
            tm.set("test", () => done(), 10);
            assert.strictEqual(tm.has("test"), true);
        });

        it("should clear a named timer", (done) => {
            tm.set(
                "test",
                () => {
                    assert.fail("Timer should have been cleared");
                },
                50,
            );
            tm.clear("test");
            assert.strictEqual(tm.has("test"), false);
            setTimeout(done, 100);
        });

        it("should replace existing timer with same name", (done) => {
            let firstFired = false;
            tm.set(
                "test",
                () => {
                    firstFired = true;
                },
                50,
            );
            tm.set(
                "test",
                () => {
                    assert.strictEqual(
                        firstFired,
                        false,
                        "First timer should not have fired",
                    );
                    done();
                },
                10,
            );
        });

        it("clearing non-existent timer should not throw", () => {
            assert.doesNotThrow(() => tm.clear("nonexistent"));
        });

        it("timer should auto-remove from map after firing", (done) => {
            tm.set(
                "test",
                () => {
                    // Check on next tick after callback
                    setTimeout(() => {
                        assert.strictEqual(tm.has("test"), false);
                        done();
                    }, 0);
                },
                10,
            );
        });
    });

    describe("setInterval/clearInterval", () => {
        it("should register a named interval", () => {
            tm.setInterval("test", () => {}, 100);
            assert.strictEqual(tm.has("test"), true);
        });

        it("should clear a named interval", () => {
            tm.setInterval("test", () => {}, 100);
            tm.clearInterval("test");
            assert.strictEqual(tm.has("test"), false);
        });

        it("should replace existing interval with same name", (done) => {
            let count = 0;
            tm.setInterval(
                "test",
                () => {
                    count++;
                },
                10,
            );
            setTimeout(() => {
                const firstCount = count;
                tm.setInterval("test", () => {}, 10000);
                setTimeout(() => {
                    assert.ok(
                        count <= firstCount + 1,
                        "Old interval should have stopped",
                    );
                    done();
                }, 50);
            }, 50);
        });
    });

    describe("clearAll", () => {
        it("should clear all timers and intervals", (done) => {
            let anyFired = false;
            tm.set(
                "timer1",
                () => {
                    anyFired = true;
                },
                50,
            );
            tm.set(
                "timer2",
                () => {
                    anyFired = true;
                },
                50,
            );
            tm.setInterval(
                "interval1",
                () => {
                    anyFired = true;
                },
                50,
            );
            tm.clearAll();
            assert.strictEqual(tm.has("timer1"), false);
            assert.strictEqual(tm.has("timer2"), false);
            assert.strictEqual(tm.has("interval1"), false);
            setTimeout(() => {
                assert.strictEqual(
                    anyFired,
                    false,
                    "No timers should have fired",
                );
                done();
            }, 100);
        });
    });

    describe("has", () => {
        it("should return true for registered timers", () => {
            tm.set("timer", () => {}, 1000);
            assert.strictEqual(tm.has("timer"), true);
        });

        it("should return true for registered intervals", () => {
            tm.setInterval("interval", () => {}, 1000);
            assert.strictEqual(tm.has("interval"), true);
        });

        it("should return false for unknown names", () => {
            assert.strictEqual(tm.has("unknown"), false);
        });
    });
});
