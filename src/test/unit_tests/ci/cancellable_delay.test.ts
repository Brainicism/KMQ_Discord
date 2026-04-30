import { cancellableDelay } from "../../../helpers/utils";
import assert from "assert";

describe("cancellableDelay", () => {
    it("should resolve after the specified delay", async () => {
        const start = Date.now();
        await cancellableDelay(50);
        const elapsed = Date.now() - start;
        assert.ok(elapsed >= 40, `Expected >= 40ms, got ${elapsed}ms`);
    });

    it("should resolve immediately when signal is already aborted", async () => {
        const ac = new AbortController();
        ac.abort();
        const start = Date.now();
        await cancellableDelay(5000, ac.signal);
        const elapsed = Date.now() - start;
        assert.ok(elapsed < 50, `Expected < 50ms, got ${elapsed}ms`);
    });

    it("should resolve early when signal is aborted during delay", async () => {
        const ac = new AbortController();
        const start = Date.now();
        setTimeout(() => ac.abort(), 30);
        await cancellableDelay(5000, ac.signal);
        const elapsed = Date.now() - start;
        assert.ok(elapsed < 200, `Expected < 200ms, got ${elapsed}ms`);
    });

    it("should resolve normally without a signal", async () => {
        await cancellableDelay(10);
    });

    it("should resolve normally with undefined signal", async () => {
        await cancellableDelay(10, undefined);
    });
});
