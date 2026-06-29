import {
    ACTIVITY_IPC_EVENT,
    ACTIVITY_IPC_REPLY,
    ACTIVITY_IPC_REQUEST,
    ACTIVITY_REQUEST_TIMEOUT_MS,
} from "../../../constants";
import ActivityHub from "../../../activity_hub";
import GameType from "../../../enums/game_type";
import assert from "assert";
import sinon from "sinon";
import type { ActivitySubscriber } from "../../../activity_hub";
import type { Fleet } from "eris-fleet";
import type ActivityReplyMessage from "../../../interfaces/activity_reply_message";
import type ActivitySnapshot from "../../../interfaces/activity_snapshot";
import type ActivityWorkerEventMessage from "../../../interfaces/activity_worker_event_message";

interface ClusterDef {
    clusterID: number;
    firstShardID: number;
    lastShardID: number;
}

interface SentRequest {
    clusterID: number;
    event: string;
    payload: { cid: string; op: string; args: any };
}

/**
 * Minimal Fleet double exposing only the surface ActivityHub touches:
 * `on` for event registration, `ipc.getWorkers` for the cluster map, and
 * `ipc.sendTo` for outbound requests. Captures sent requests and lets tests
 * drive inbound events/replies via `emit`.
 */
class FakeFleet {
    handlers: Map<string, (msg: any) => void> = new Map();

    sent: Array<SentRequest> = [];

    getWorkersCallCount = 0;

    // Reply automatically (on a microtask) to every request that gets sent.
    autoReply: ((payload: SentRequest["payload"]) => void) | null = null;

    // Force sendTo to throw, simulating an IPC failure.
    sendToThrows: Error | null = null;

    ipc = {
        getWorkers: (): Promise<{ clusters: Map<number, ClusterDef> }> => {
            this.getWorkersCallCount += 1;
            return Promise.resolve({ clusters: this.clusters });
        },
        sendTo: (clusterID: number, event: string, payload: any): void => {
            if (this.sendToThrows) {
                throw this.sendToThrows;
            }

            this.sent.push({ clusterID, event, payload });
            if (this.autoReply) {
                const captured = payload;
                queueMicrotask(() => this.autoReply!(captured));
            }
        },
    };

    private clusters: Map<number, ClusterDef>;

    constructor(clusters: Array<ClusterDef>) {
        this.clusters = new Map(clusters.map((c) => [c.clusterID, c]));
    }

    setClusters(clusters: Array<ClusterDef>): void {
        this.clusters = new Map(clusters.map((c) => [c.clusterID, c]));
    }

    on(event: string, handler: (msg: any) => void): void {
        this.handlers.set(event, handler);
    }

    emit(event: string, msg: any): void {
        const handler = this.handlers.get(event);
        if (handler) handler(msg);
    }
}

function makeHub(clusters: Array<ClusterDef>): {
    hub: ActivityHub;
    fleet: FakeFleet;
} {
    const fleet = new FakeFleet(clusters);
    const hub = new ActivityHub(fleet as unknown as Fleet);
    return { hub, fleet };
}

// Two clusters covering shards 0-1 and 2-3 → shardCount 4.
const TWO_CLUSTERS: Array<ClusterDef> = [
    { clusterID: 0, firstShardID: 0, lastShardID: 1 },
    { clusterID: 1, firstShardID: 2, lastShardID: 3 },
];

const emptySnapshot: ActivitySnapshot = {
    hasSession: false,
    options: {} as any,
};

describe("ActivityHub", () => {
    describe("start", () => {
        it("registers event + reply handlers and loads the cluster map", async () => {
            const { hub, fleet } = makeHub(TWO_CLUSTERS);
            await hub.start();

            assert.ok(fleet.handlers.has(ACTIVITY_IPC_EVENT));
            assert.ok(fleet.handlers.has(ACTIVITY_IPC_REPLY));
            assert.strictEqual(fleet.getWorkersCallCount, 1);
        });

        it("is idempotent — a second start() does not re-fetch workers", async () => {
            const { hub, fleet } = makeHub(TWO_CLUSTERS);
            await hub.start();
            await hub.start();
            assert.strictEqual(fleet.getWorkersCallCount, 1);
        });
    });

    describe("clusterIdForGuild", () => {
        it("returns null before the cluster map is loaded", () => {
            const { hub } = makeHub(TWO_CLUSTERS);
            assert.strictEqual(hub.clusterIdForGuild("0"), null);
        });

        it("routes guilds to the cluster owning their shard", async () => {
            const { hub } = makeHub(TWO_CLUSTERS);
            await hub.start();

            // shardID = (guildID >> 22) % shardCount(=4)
            // "0"        → 0 → cluster 0
            // 2^22       → 1 → cluster 0
            // 2^23       → 2 → cluster 1
            // 3 * 2^22   → 3 → cluster 1
            assert.strictEqual(hub.clusterIdForGuild("0"), 0);
            assert.strictEqual(hub.clusterIdForGuild(String(2 ** 22)), 0);
            assert.strictEqual(hub.clusterIdForGuild(String(2 ** 23)), 1);
            assert.strictEqual(hub.clusterIdForGuild(String(3 * 2 ** 22)), 1);
        });

        it("handles large realistic snowflakes", async () => {
            const { hub } = makeHub(TWO_CLUSTERS);
            await hub.start();

            const guildID = "759926307628679208";
            const expectedShard = Number((BigInt(guildID) >> 22n) % 4n);
            const expectedCluster = expectedShard <= 1 ? 0 : 1;
            assert.strictEqual(hub.clusterIdForGuild(guildID), expectedCluster);
        });

        it("returns null when the shard falls in a gap between cluster ranges", async () => {
            // shards 0 and 2 are owned; shard 1 is unassigned. shardCount = 3.
            const { hub } = makeHub([
                { clusterID: 0, firstShardID: 0, lastShardID: 0 },
                { clusterID: 1, firstShardID: 2, lastShardID: 2 },
            ]);

            await hub.start();

            // 2^22 → shard (1) % 3 = 1 → unassigned
            assert.strictEqual(hub.clusterIdForGuild(String(2 ** 22)), null);
            // shard 0 and shard 2 still resolve
            assert.strictEqual(hub.clusterIdForGuild("0"), 0);
            assert.strictEqual(hub.clusterIdForGuild(String(2 ** 23)), 1);
        });
    });

    describe("subscriber registry", () => {
        const makeSub = (id: string): ActivitySubscriber => ({
            id,
            send: () => undefined,
            close: () => undefined,
        });

        it("counts subscribers across guilds", () => {
            const { hub } = makeHub(TWO_CLUSTERS);
            hub.subscribe("g1", makeSub("a"));
            hub.subscribe("g1", makeSub("b"));
            hub.subscribe("g2", makeSub("c"));
            assert.strictEqual(hub.getSubscriberCount(), 3);
        });

        it("removes a subscriber and prunes the empty guild set", () => {
            const { hub } = makeHub(TWO_CLUSTERS);
            const sub = makeSub("a");
            hub.subscribe("g1", sub);
            assert.strictEqual(hub.getSubscriberCount(), 1);

            hub.unsubscribe("g1", sub);
            assert.strictEqual(hub.getSubscriberCount(), 0);
            // Removing again is a no-op and does not throw.
            hub.unsubscribe("g1", sub);
            assert.strictEqual(hub.getSubscriberCount(), 0);
        });

        it("does not double-count the same subscriber object", () => {
            const { hub } = makeHub(TWO_CLUSTERS);
            const sub = makeSub("a");
            hub.subscribe("g1", sub);
            hub.subscribe("g1", sub);
            assert.strictEqual(hub.getSubscriberCount(), 1);
        });
    });

    describe("worker event fan-out", () => {
        it("forwards a guild's event (as JSON) to that guild's subscribers only", async () => {
            const { hub, fleet } = makeHub(TWO_CLUSTERS);
            await hub.start();

            const g1a: string[] = [];
            const g1b: string[] = [];
            const g2: string[] = [];
            hub.subscribe("g1", {
                id: "1a",
                send: (d) => g1a.push(d),
                close: () => undefined,
            });

            hub.subscribe("g1", {
                id: "1b",
                send: (d) => g1b.push(d),
                close: () => undefined,
            });

            hub.subscribe("g2", {
                id: "2",
                send: (d) => g2.push(d),
                close: () => undefined,
            });

            const event = { type: "roundEnd" } as any;
            const msg: ActivityWorkerEventMessage = { guildID: "g1", event };
            fleet.emit(ACTIVITY_IPC_EVENT, msg);

            const expected = JSON.stringify(event);
            assert.deepStrictEqual(g1a, [expected]);
            assert.deepStrictEqual(g1b, [expected]);
            assert.deepStrictEqual(g2, []);
        });

        it("is a no-op when the guild has no subscribers", async () => {
            const { hub, fleet } = makeHub(TWO_CLUSTERS);
            await hub.start();
            // No subscribers registered — must not throw.
            fleet.emit(ACTIVITY_IPC_EVENT, {
                guildID: "ghost",
                event: { type: "roundEnd" } as any,
            });
        });

        it("isolates a throwing subscriber so others still receive", async () => {
            const { hub, fleet } = makeHub(TWO_CLUSTERS);
            await hub.start();

            const good: string[] = [];
            hub.subscribe("g1", {
                id: "bad",
                send: () => {
                    throw new Error("socket closed");
                },
                close: () => undefined,
            });

            hub.subscribe("g1", {
                id: "good",
                send: (d) => good.push(d),
                close: () => undefined,
            });

            fleet.emit(ACTIVITY_IPC_EVENT, {
                guildID: "g1",
                event: { type: "scoreboardUpdate" } as any,
            });

            assert.strictEqual(good.length, 1);
        });
    });

    describe("request / reply correlation", () => {
        it("sends a correlated request to the owning cluster and resolves on reply", async () => {
            const { hub, fleet } = makeHub(TWO_CLUSTERS);
            await hub.start();

            fleet.autoReply = (payload) => {
                const reply: ActivityReplyMessage = {
                    cid: payload.cid,
                    payload: emptySnapshot,
                };

                fleet.emit(ACTIVITY_IPC_REPLY, reply);
            };

            // guild "0" → shard 0 → cluster 0
            const result = await hub.requestSnapshot("0");

            assert.deepStrictEqual(result, emptySnapshot);
            assert.strictEqual(fleet.sent.length, 1);
            assert.strictEqual(fleet.sent[0]!.clusterID, 0);
            assert.strictEqual(fleet.sent[0]!.event, ACTIVITY_IPC_REQUEST);
            assert.strictEqual(fleet.sent[0]!.payload.op, "snapshot");
            assert.deepStrictEqual(fleet.sent[0]!.payload.args, {
                guildID: "0",
            });
            assert.ok(fleet.sent[0]!.payload.cid);
        });

        it("rejects when the worker replies with an error", async () => {
            const { hub, fleet } = makeHub(TWO_CLUSTERS);
            await hub.start();

            fleet.autoReply = (payload) => {
                fleet.emit(ACTIVITY_IPC_REPLY, {
                    cid: payload.cid,
                    error: "no active session",
                });
            };

            await assert.rejects(hub.requestSnapshot("0"), /no active session/);
        });

        it("ignores replies with an unknown correlation ID", async () => {
            const { hub, fleet } = makeHub(TWO_CLUSTERS);
            await hub.start();
            // Must not throw even with nothing pending.
            fleet.emit(ACTIVITY_IPC_REPLY, {
                cid: "does-not-exist",
                payload: emptySnapshot,
            });
        });

        it("routes guess submissions with the right op and args", async () => {
            const { hub, fleet } = makeHub(TWO_CLUSTERS);
            await hub.start();

            fleet.autoReply = (payload) => {
                fleet.emit(ACTIVITY_IPC_REPLY, {
                    cid: payload.cid,
                    payload: { ok: true },
                });
            };

            const res = await hub.submitGuess("0", "user1", "twice", 12345);
            assert.deepStrictEqual(res, { ok: true });
            assert.strictEqual(fleet.sent[0]!.payload.op, "guess");
            assert.deepStrictEqual(fleet.sent[0]!.payload.args, {
                guildID: "0",
                userID: "user1",
                guess: "twice",
                ts: 12345,
            });
        });

        it("rejects and cleans up when sendTo throws", async () => {
            const { hub, fleet } = makeHub(TWO_CLUSTERS);
            await hub.start();
            fleet.sendToThrows = new Error("IPC down");

            await assert.rejects(hub.requestSnapshot("0"), /IPC down/);
        });
    });

    describe("request timeout", () => {
        let clock: sinon.SinonFakeTimers;

        beforeEach(() => {
            clock = sinon.useFakeTimers();
        });

        afterEach(() => {
            clock.restore();
        });

        it("rejects after ACTIVITY_REQUEST_TIMEOUT_MS when no reply arrives", async () => {
            const { hub } = makeHub(TWO_CLUSTERS);
            await hub.start();

            const p = hub.requestSnapshot("0");
            // Flush microtasks while advancing the fake clock past the timeout.
            await clock.tickAsync(ACTIVITY_REQUEST_TIMEOUT_MS);
            await assert.rejects(p, /timed out/);
        });
    });

    describe("cluster map refresh", () => {
        it("refreshes the map and retries when a guild has no known cluster yet", async () => {
            // Start with an empty cluster map (handlers wired, shardCount 0),
            // then bring clusters online. The first lookup misses, the lazy
            // refresh inside requestSnapshot picks them up.
            const { hub, fleet } = makeHub([]);
            await hub.start();
            assert.strictEqual(hub.clusterIdForGuild("0"), null);

            fleet.setClusters(TWO_CLUSTERS);
            fleet.autoReply = (payload) => {
                fleet.emit(ACTIVITY_IPC_REPLY, {
                    cid: payload.cid,
                    payload: emptySnapshot,
                });
            };

            const callsBefore = fleet.getWorkersCallCount;
            const result = await hub.requestSnapshot("0");
            assert.deepStrictEqual(result, emptySnapshot);
            // A second getWorkers happened lazily inside requestSnapshot.
            assert.ok(fleet.getWorkersCallCount > callsBefore);
            assert.strictEqual(fleet.sent[0]!.clusterID, 0);
        });

        it("throws when no cluster can be resolved even after a refresh", async () => {
            const { hub } = makeHub([]); // no clusters at all
            await assert.rejects(hub.requestSnapshot("0"), /No cluster found/);
        });
    });

    describe("autocompleteArtists", () => {
        it("routes to the first cluster regardless of guild", async () => {
            const { hub, fleet } = makeHub(TWO_CLUSTERS);
            await hub.start();

            fleet.autoReply = (payload) => {
                fleet.emit(ACTIVITY_IPC_REPLY, {
                    cid: payload.cid,
                    payload: { results: [{ id: 1, name: "TWICE" }] },
                });
            };

            const res = await hub.autocompleteArtists("twi");
            assert.deepStrictEqual(res.results, [{ id: 1, name: "TWICE" }]);
            assert.strictEqual(fleet.sent[0]!.clusterID, 0);
            assert.strictEqual(
                fleet.sent[0]!.payload.op,
                "autocompleteArtists",
            );

            assert.deepStrictEqual(fleet.sent[0]!.payload.args, {
                query: "twi",
            });
        });

        it("returns an empty result set when no worker is available", async () => {
            const { hub, fleet } = makeHub([]); // no clusters
            const res = await hub.autocompleteArtists("twi");
            assert.deepStrictEqual(res, { results: [] });
            // Nothing was dispatched.
            assert.strictEqual(fleet.sent.length, 0);
        });
    });

    describe("songInfo", () => {
        it("routes to the guild's owning cluster with the right op and args", async () => {
            const { hub, fleet } = makeHub(TWO_CLUSTERS);
            await hub.start();

            fleet.autoReply = (payload) => {
                fleet.emit(ACTIVITY_IPC_REPLY, {
                    cid: payload.cid,
                    payload: { found: true, info: { songName: "TT" } },
                });
            };

            const res = await hub.songInfo({
                guildID: "0",
                youtubeLink: "abc123",
            });

            assert.deepStrictEqual(res, {
                found: true,
                info: { songName: "TT" },
            });
            assert.strictEqual(fleet.sent[0]!.payload.op, "songInfo");
            assert.deepStrictEqual(fleet.sent[0]!.payload.args, {
                guildID: "0",
                youtubeLink: "abc123",
            });
        });
    });

    describe("searchSongs", () => {
        it("routes to the first cluster regardless of guild", async () => {
            const { hub, fleet } = makeHub(TWO_CLUSTERS);
            await hub.start();

            fleet.autoReply = (payload) => {
                fleet.emit(ACTIVITY_IPC_REPLY, {
                    cid: payload.cid,
                    payload: {
                        results: [
                            {
                                youtubeLink: "abc123",
                                songName: "TT",
                                artistName: "TWICE",
                                publishYear: 2016,
                            },
                        ],
                    },
                });
            };

            const res = await hub.searchSongs("tt", "en");
            assert.deepStrictEqual(res.results, [
                {
                    youtubeLink: "abc123",
                    songName: "TT",
                    artistName: "TWICE",
                    publishYear: 2016,
                },
            ]);
            assert.strictEqual(fleet.sent[0]!.clusterID, 0);
            assert.strictEqual(fleet.sent[0]!.payload.op, "searchSongs");
            assert.deepStrictEqual(fleet.sent[0]!.payload.args, {
                query: "tt",
                locale: "en",
            });
        });

        it("returns an empty result set when no worker is available", async () => {
            const { hub, fleet } = makeHub([]); // no clusters
            const res = await hub.searchSongs("tt", "en");
            assert.deepStrictEqual(res, { results: [] });
            assert.strictEqual(fleet.sent.length, 0);
        });
    });

    describe("guild-routed action ops", () => {
        // Each action method resolves the owning cluster for its guild and
        // forwards a request under a fixed op with the caller's args. These
        // pin the op name + args shape so a rename/refactor can't silently
        // reroute a player action. guild "0" → shard 0 → cluster 0.
        async function dispatch(
            invoke: (hub: ActivityHub) => Promise<unknown>,
        ): Promise<SentRequest> {
            const { hub, fleet } = makeHub(TWO_CLUSTERS);
            await hub.start();
            fleet.autoReply = (payload) => {
                fleet.emit(ACTIVITY_IPC_REPLY, {
                    cid: payload.cid,
                    payload: { ok: true },
                });
            };

            await invoke(hub);
            assert.strictEqual(fleet.sent.length, 1);
            return fleet.sent[0]!;
        }

        it("submitMcGuess → mcGuess", async () => {
            const sent = await dispatch((hub) =>
                hub.submitMcGuess("0", "user1", "choice-uuid", 12345),
            );

            assert.strictEqual(sent.clusterID, 0);
            assert.strictEqual(sent.payload.op, "mcGuess");
            assert.deepStrictEqual(sent.payload.args, {
                guildID: "0",
                userID: "user1",
                choiceID: "choice-uuid",
                ts: 12345,
            });
        });

        it("startGame → startGame", async () => {
            const args = {
                guildID: "0",
                userID: "user1",
                voiceChannelID: "vc1",
                textChannelID: "tc1",
                gameType: GameType.CLASSIC,
            };

            const sent = await dispatch((hub) => hub.startGame(args));
            assert.strictEqual(sent.clusterID, 0);
            assert.strictEqual(sent.payload.op, "startGame");
            assert.deepStrictEqual(sent.payload.args, args);
        });

        it("skipVote → skipVote", async () => {
            const args = { guildID: "0", userID: "user1" };
            const sent = await dispatch((hub) => hub.skipVote(args));
            assert.strictEqual(sent.payload.op, "skipVote");
            assert.deepStrictEqual(sent.payload.args, args);
        });

        it("endGame → endGame", async () => {
            const args = { guildID: "0", userID: "user1" };
            const sent = await dispatch((hub) => hub.endGame(args));
            assert.strictEqual(sent.payload.op, "endGame");
            assert.deepStrictEqual(sent.payload.args, args);
        });

        it("hint → hint", async () => {
            const args = { guildID: "0", userID: "user1" };
            const sent = await dispatch((hub) => hub.hint(args));
            assert.strictEqual(sent.payload.op, "hint");
            assert.deepStrictEqual(sent.payload.args, args);
        });

        it("bookmark → bookmark", async () => {
            const args = {
                guildID: "0",
                userID: "user1",
                youtubeLink: "abc123",
            };

            const sent = await dispatch((hub) => hub.bookmark(args));
            assert.strictEqual(sent.payload.op, "bookmark");
            assert.deepStrictEqual(sent.payload.args, args);
        });

        it("setOption → setOption (carries the discriminated payload)", async () => {
            const args = {
                guildID: "0",
                userID: "user1",
                kind: "limit" as const,
                limitStart: 0,
                limitEnd: 100,
            };

            const sent = await dispatch((hub) => hub.setOption(args));
            assert.strictEqual(sent.payload.op, "setOption");
            assert.deepStrictEqual(sent.payload.args, args);
        });

        it("preset → preset", async () => {
            const args = {
                guildID: "0",
                userID: "user1",
                action: "save" as const,
                name: "my-preset",
            };

            const sent = await dispatch((hub) => hub.preset(args));
            assert.strictEqual(sent.payload.op, "preset");
            assert.deepStrictEqual(sent.payload.args, args);
        });

        it("profile → profile (forwards the optional target)", async () => {
            const args = {
                guildID: "0",
                userID: "user1",
                targetUserID: "user2",
            };

            const sent = await dispatch((hub) => hub.profile(args));
            assert.strictEqual(sent.payload.op, "profile");
            assert.deepStrictEqual(sent.payload.args, args);
        });

        it("emote → emote", async () => {
            const args = {
                guildID: "0",
                userID: "user1",
                emote: "🔥",
            };

            const sent = await dispatch((hub) => hub.emote(args));
            assert.strictEqual(sent.payload.op, "emote");
            assert.deepStrictEqual(sent.payload.args, args);
        });

        it("dailyChallengeInfo → dailyChallengeInfo", async () => {
            const args = { guildID: "0", userID: "user1" };
            const sent = await dispatch((hub) => hub.dailyChallengeInfo(args));

            assert.strictEqual(sent.payload.op, "dailyChallengeInfo");
            assert.deepStrictEqual(sent.payload.args, args);
        });

        it("startDailyChallenge → startDailyChallenge", async () => {
            const args = {
                guildID: "0",
                userID: "user1",
                textChannelID: "tc1",
            };

            const sent = await dispatch((hub) => hub.startDailyChallenge(args));
            assert.strictEqual(sent.payload.op, "startDailyChallenge");
            assert.deepStrictEqual(sent.payload.args, args);
        });

        it("routes to the cluster owning the guild, not always cluster 0", async () => {
            // guild 2^23 → shard 2 → cluster 1
            const guildID = String(2 ** 23);
            const sent = await dispatch((hub) =>
                hub.skipVote({ guildID, userID: "u" }),
            );

            assert.strictEqual(sent.clusterID, 1);
        });
    });
});
