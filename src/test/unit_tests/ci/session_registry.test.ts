import assert from "assert";

import { SessionRegistry } from "../../../structures/session_registry";

describe("SessionRegistry", () => {
    let registry: SessionRegistry;

    beforeEach(() => {
        registry = new SessionRegistry();
    });

    describe("creation locks", () => {
        it("should create a new lock for unknown guild", () => {
            const lock = registry.getOrCreateLock("guild1");
            assert.ok(lock);
        });

        it("should return same lock for same guild", () => {
            const lock1 = registry.getOrCreateLock("guild1");
            const lock2 = registry.getOrCreateLock("guild1");
            assert.strictEqual(lock1, lock2);
        });

        it("should return different locks for different guilds", () => {
            const lock1 = registry.getOrCreateLock("guild1");
            const lock2 = registry.getOrCreateLock("guild2");
            assert.notStrictEqual(lock1, lock2);
        });

        it("releaseLock should remove unlocked lock", () => {
            registry.getOrCreateLock("guild1");
            assert.strictEqual(registry.getLockCount(), 1);
            registry.releaseLock("guild1");
            assert.strictEqual(registry.getLockCount(), 0);
        });

        it("releaseLock should not remove locked lock", async () => {
            const lock = registry.getOrCreateLock("guild1");
            const release = await lock.acquire();
            registry.releaseLock("guild1");
            assert.strictEqual(registry.getLockCount(), 1);
            release();
        });

        it("releaseLock for unknown guild should not throw", () => {
            assert.doesNotThrow(() => registry.releaseLock("unknown"));
        });
    });
});
