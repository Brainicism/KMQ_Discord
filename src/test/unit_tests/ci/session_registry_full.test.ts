import { SessionRegistry } from "../../../structures/session_registry";
import assert from "assert";

// Minimal mock of Session for registry tests
class MockSession {
    constructor(
        public readonly guildID: string,
        private readonly _isGame: boolean,
    ) {}

    sessionName(): string {
        return this._isGame ? "Game" : "Listening";
    }
    isGameSession(): boolean {
        return this._isGame;
    }
    isListeningSession(): boolean {
        return !this._isGame;
    }
}

describe("SessionRegistry (full)", () => {
    let registry: SessionRegistry;

    beforeEach(() => {
        registry = new SessionRegistry();
    });

    describe("session map", () => {
        it("get should return undefined for unknown guild", () => {
            assert.strictEqual(registry.get("unknown"), undefined);
        });

        it("set and get should work", () => {
            const session = new MockSession("guild1", true) as any;
            registry.set("guild1", session);
            assert.strictEqual(registry.get("guild1"), session);
        });

        it("has should return true after set", () => {
            registry.set("guild1", new MockSession("guild1", true) as any);
            assert.strictEqual(registry.has("guild1"), true);
        });

        it("has should return false for unknown guild", () => {
            assert.strictEqual(registry.has("unknown"), false);
        });

        it("delete should remove session", () => {
            registry.set("guild1", new MockSession("guild1", true) as any);
            assert.strictEqual(registry.delete("guild1"), true);
            assert.strictEqual(registry.has("guild1"), false);
        });

        it("delete should return false for unknown guild", () => {
            assert.strictEqual(registry.delete("unknown"), false);
        });

        it("size should reflect number of sessions", () => {
            assert.strictEqual(registry.size, 0);
            registry.set("guild1", new MockSession("guild1", true) as any);
            assert.strictEqual(registry.size, 1);
            registry.set("guild2", new MockSession("guild2", false) as any);
            assert.strictEqual(registry.size, 2);
            registry.delete("guild1");
            assert.strictEqual(registry.size, 1);
        });

        it("getAllSessions should return all sessions", () => {
            registry.set("guild1", new MockSession("guild1", true) as any);
            registry.set("guild2", new MockSession("guild2", false) as any);
            assert.strictEqual(registry.getAllSessions().length, 2);
        });

        it("getGameSessions should filter to game sessions", () => {
            registry.set("guild1", new MockSession("guild1", true) as any);
            registry.set("guild2", new MockSession("guild2", false) as any);
            const games = registry.getGameSessions();
            assert.strictEqual(games.length, 1);
        });

        it("getListeningSessions should filter to listening sessions", () => {
            registry.set("guild1", new MockSession("guild1", true) as any);
            registry.set("guild2", new MockSession("guild2", false) as any);
            const listening = registry.getListeningSessions();
            assert.strictEqual(listening.length, 1);
        });
    });

    describe("getOrCreate", () => {
        it("should create session when none exists", async () => {
            const session = new MockSession("guild1", true) as any;
            const result = await registry.getOrCreate(
                "guild1",
                async () => session,
            );
            assert.strictEqual(result.created, true);
            assert.strictEqual(result.session, session);
            assert.strictEqual(registry.get("guild1"), session);
        });

        it("should return existing session without calling factory", async () => {
            const session1 = new MockSession("guild1", true) as any;
            registry.set("guild1", session1);

            let factoryCalled = false;
            const result = await registry.getOrCreate("guild1", async () => {
                factoryCalled = true;
                return new MockSession("guild1", true) as any;
            });

            assert.strictEqual(result.created, false);
            assert.strictEqual(result.session, session1);
            assert.strictEqual(factoryCalled, false);
        });

        it("concurrent getOrCreate should only create once", async () => {
            let createCount = 0;
            const factory = async (): Promise<any> => {
                createCount++;
                return new MockSession("guild1", true) as any;
            };

            const [r1, r2] = await Promise.all([
                registry.getOrCreate("guild1", factory),
                registry.getOrCreate("guild1", factory),
            ]);

            assert.strictEqual(
                createCount,
                1,
                "Factory should only be called once",
            );
            assert.strictEqual(
                r1.session,
                r2.session,
                "Both should return same session",
            );
            assert.strictEqual(
                r1.created !== r2.created || r1.created === true,
                true,
            );
        });
    });
});
