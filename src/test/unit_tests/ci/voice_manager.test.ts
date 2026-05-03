/* eslint-disable no-underscore-dangle */
import { VoiceManager, VoiceState } from "../../../structures/voice_manager";
import assert from "assert";

// --- Mock helpers ---

function createMockConnection(opts?: {
    ready?: boolean;
    encoding?: boolean;
    channelID?: string;
}): any {
    const listeners: Record<string, Function[]> = {};
    return {
        ready: opts?.ready ?? true,
        channelID: opts?.channelID ?? "vc-123",
        piper: { encoding: opts?.encoding ?? false },
        on(event: string, fn: Function) {
            (listeners[event] = listeners[event] || []).push(fn);
        },
        once(event: string, fn: Function) {
            (listeners[event] = listeners[event] || []).push(fn);
        },
        removeAllListeners(event?: string) {
            if (event) {
                delete listeners[event];
            } else {
                for (const k of Object.keys(listeners)) {
                    delete listeners[k];
                }
            }
        },
        stopPlaying() {},
        /**
         * Test helper: fire registered listeners for an event
         * @param event - The event name to emit
         * @param args - Arguments to pass to the listeners
         */
        _emit(event: string, ...args: any[]) {
            const fns = listeners[event] || [];
            for (const fn of fns) {
                fn(...args);
            }
        },
        _listeners: listeners,
    };
}

function createMockClient(opts?: {
    joinThrows?: boolean;
    mockConnection?: any;
}): any {
    const conn = opts?.mockConnection ?? createMockConnection();
    return {
        joinVoiceChannel: opts?.joinThrows
            ? () => {
                  throw new Error("Cannot join VC");
              }
            : () => Promise.resolve(conn),
        getChannel: () => ({ leave() {} }),
        _connection: conn,
    };
}

/**
 * Access private fields for testing via type assertion
 * @param vm - The VoiceManager instance to access private fields on
 * @returns The VoiceManager cast to any for private field access
 */
function getPrivate(vm: VoiceManager): any {
    return vm as any;
}

describe("VoiceState enum", () => {
    it("should have all expected states", () => {
        assert.strictEqual(VoiceState.DISCONNECTED, "DISCONNECTED");
        assert.strictEqual(VoiceState.CONNECTING, "CONNECTING");
        assert.strictEqual(VoiceState.READY, "READY");
        assert.strictEqual(VoiceState.PLAYING, "PLAYING");
        assert.strictEqual(VoiceState.ERROR, "ERROR");
    });
});

describe("VoiceManager", () => {
    describe("constructor and initial state", () => {
        it("should start in DISCONNECTED state with null connection", () => {
            const client = createMockClient();
            const vm = new VoiceManager("guild-1", "vc-1", client);
            assert.strictEqual(vm.state, VoiceState.DISCONNECTED);
            assert.strictEqual(vm.connection, null);
        });
    });

    describe("updateVoiceChannelID", () => {
        it("should update the internal voice channel ID", () => {
            const client = createMockClient();
            const vm = new VoiceManager("guild-1", "vc-1", client);
            vm.updateVoiceChannelID("vc-2");
            assert.strictEqual(getPrivate(vm).voiceChannelID, "vc-2");
        });
    });

    describe("ensureConnected", () => {
        it("should return immediately if connection is already ready", async () => {
            const conn = createMockConnection({ ready: true });
            const client = createMockClient({ mockConnection: conn });
            const vm = new VoiceManager("guild-1", "vc-1", client);
            getPrivate(vm).voiceConnection = conn;
            getPrivate(vm).voiceState = VoiceState.READY;

            await vm.ensureConnected();
            assert.strictEqual(vm.state, VoiceState.READY);
        });

        it("should transition to READY on successful join", async () => {
            const conn = createMockConnection({ ready: true });
            const client = createMockClient({ mockConnection: conn });
            const vm = new VoiceManager("guild-1", "vc-1", client);

            await vm.ensureConnected();
            assert.strictEqual(vm.state, VoiceState.READY);
            assert.strictEqual(vm.connection, conn);
        });

        it("should set state to DISCONNECTED and rethrow on join failure", async () => {
            const client = createMockClient({ joinThrows: true });
            const vm = new VoiceManager("guild-1", "vc-1", client);

            await assert.rejects(
                () => vm.ensureConnected(),
                (err: Error) => {
                    assert.strictEqual(err.message, "Cannot join VC");
                    return true;
                },
            );
            assert.strictEqual(vm.state, VoiceState.DISCONNECTED);
            assert.strictEqual(vm.connection, null);
        });
    });

    describe("ensureEncoderIdle", () => {
        it("should throw if connection is null", async () => {
            const client = createMockClient();
            const vm = new VoiceManager("guild-1", "vc-1", client);

            await assert.rejects(
                () => vm.ensureEncoderIdle(),
                (err: Error) => {
                    assert.ok(
                        err.message.includes("Connection is unexpectedly null"),
                    );
                    return true;
                },
            );
        });

        it("should return immediately if connection is ready", async () => {
            const conn = createMockConnection({ ready: true });
            const client = createMockClient({ mockConnection: conn });
            const vm = new VoiceManager("guild-1", "vc-1", client);
            getPrivate(vm).voiceConnection = conn;

            await vm.ensureEncoderIdle();
        });

        it("should return immediately if piper is not encoding", async () => {
            const conn = createMockConnection({
                ready: false,
                encoding: false,
            });

            const client = createMockClient({ mockConnection: conn });
            const vm = new VoiceManager("guild-1", "vc-1", client);
            getPrivate(vm).voiceConnection = conn;

            await vm.ensureEncoderIdle();
        });

        it("should call stopPlaying if encoder is still busy after timeout", async () => {
            let stopPlayingCalled = false;
            const conn = createMockConnection({
                ready: false,
                encoding: true,
            });

            conn.stopPlaying = () => {
                stopPlayingCalled = true;
            };

            const client = createMockClient({ mockConnection: conn });
            const vm = new VoiceManager("guild-1", "vc-1", client);
            getPrivate(vm).voiceConnection = conn;

            await vm.ensureEncoderIdle();
            assert.strictEqual(stopPlayingCalled, true);
        });
    });

    describe("onceStreamEnd", () => {
        it("should set state to PLAYING and update currentRoundId", () => {
            const conn = createMockConnection();
            const client = createMockClient({ mockConnection: conn });
            const vm = new VoiceManager("guild-1", "vc-1", client);
            getPrivate(vm).voiceConnection = conn;

            vm.onceStreamEnd(
                "round-1",
                () => Promise.resolve(),
                () => Promise.resolve(),
            );
            assert.strictEqual(vm.state, VoiceState.PLAYING);
            assert.strictEqual(getPrivate(vm).currentRoundId, "round-1");
        });

        it("should not throw when connection is null", () => {
            const client = createMockClient();
            const vm = new VoiceManager("guild-1", "vc-1", client);

            assert.doesNotThrow(() => {
                vm.onceStreamEnd(
                    "round-1",
                    () => Promise.resolve(),
                    () => Promise.resolve(),
                );
            });
            assert.strictEqual(vm.state, VoiceState.PLAYING);
        });

        it("should call onEnd and set state to READY when end fires with matching roundId", async () => {
            const conn = createMockConnection();
            const client = createMockClient({ mockConnection: conn });
            const vm = new VoiceManager("guild-1", "vc-1", client);
            getPrivate(vm).voiceConnection = conn;

            let onEndCalled = false;
            vm.onceStreamEnd(
                "round-1",
                () => {
                    onEndCalled = true;
                    return Promise.resolve();
                },
                () => Promise.resolve(),
            );

            await conn._emit("end");
            assert.strictEqual(onEndCalled, true);
            assert.strictEqual(vm.state, VoiceState.READY);
        });

        it("should NOT call onEnd when end fires with stale roundId", async () => {
            const conn = createMockConnection();
            const client = createMockClient({ mockConnection: conn });
            const vm = new VoiceManager("guild-1", "vc-1", client);
            getPrivate(vm).voiceConnection = conn;

            let onEndCalled = false;
            vm.onceStreamEnd(
                "round-1",
                () => {
                    onEndCalled = true;
                    return Promise.resolve();
                },
                () => Promise.resolve(),
            );

            getPrivate(vm).currentRoundId = "round-2";
            await conn._emit("end");
            assert.strictEqual(onEndCalled, false);
        });

        it("should call onError and set state to ERROR when error fires with matching roundId", async () => {
            const conn = createMockConnection();
            const client = createMockClient({ mockConnection: conn });
            const vm = new VoiceManager("guild-1", "vc-1", client);
            getPrivate(vm).voiceConnection = conn;

            let onErrorCalled = false;
            let receivedErr: Error | null = null;
            vm.onceStreamEnd(
                "round-1",
                () => Promise.resolve(),
                (err: Error) => {
                    onErrorCalled = true;
                    receivedErr = err;
                    return Promise.resolve();
                },
            );

            const testError = new Error("stream broke");
            await conn._emit("error", testError);
            assert.strictEqual(onErrorCalled, true);
            assert.strictEqual(receivedErr, testError);
            assert.strictEqual(vm.state, VoiceState.ERROR);
        });

        it("should NOT call onError when error fires with stale roundId", async () => {
            const conn = createMockConnection();
            const client = createMockClient({ mockConnection: conn });
            const vm = new VoiceManager("guild-1", "vc-1", client);
            getPrivate(vm).voiceConnection = conn;

            let onErrorCalled = false;
            vm.onceStreamEnd(
                "round-1",
                () => Promise.resolve(),
                () => {
                    onErrorCalled = true;
                    return Promise.resolve();
                },
            );

            getPrivate(vm).currentRoundId = "round-2";
            await conn._emit("error", new Error("old error"));
            assert.strictEqual(onErrorCalled, false);
        });
    });

    describe("stopPlaying", () => {
        it("should call stopPlaying on connection", () => {
            const conn = createMockConnection();
            let stopCalled = false;
            conn.stopPlaying = () => {
                stopCalled = true;
            };

            const client = createMockClient({ mockConnection: conn });
            const vm = new VoiceManager("guild-1", "vc-1", client);
            getPrivate(vm).voiceConnection = conn;

            vm.stopPlaying();
            assert.strictEqual(stopCalled, true);
        });

        it("should not throw when connection is null", () => {
            const client = createMockClient();
            const vm = new VoiceManager("guild-1", "vc-1", client);
            assert.doesNotThrow(() => vm.stopPlaying());
        });
    });

    describe("disconnect", () => {
        it("should set state to DISCONNECTED and null connection", () => {
            const conn = createMockConnection();
            const client = createMockClient({ mockConnection: conn });
            const vm = new VoiceManager("guild-1", "vc-1", client);
            getPrivate(vm).voiceConnection = conn;
            getPrivate(vm).voiceState = VoiceState.READY;

            vm.disconnect();
            assert.strictEqual(vm.state, VoiceState.DISCONNECTED);
            assert.strictEqual(vm.connection, null);
        });

        it("should call stopPlaying and removeAllListeners on connection", () => {
            let stopCalled = false;
            let removeListenersCalled = false;
            const conn = createMockConnection();
            conn.stopPlaying = () => {
                stopCalled = true;
            };

            const origRemove = conn.removeAllListeners.bind(conn);
            conn.removeAllListeners = (event?: string) => {
                removeListenersCalled = true;
                origRemove(event);
            };

            const client = createMockClient({ mockConnection: conn });
            const vm = new VoiceManager("guild-1", "vc-1", client);
            getPrivate(vm).voiceConnection = conn;

            vm.disconnect();
            assert.strictEqual(stopCalled, true);
            assert.strictEqual(removeListenersCalled, true);
        });

        it("should clear currentRoundId", () => {
            const conn = createMockConnection();
            const client = createMockClient({ mockConnection: conn });
            const vm = new VoiceManager("guild-1", "vc-1", client);
            getPrivate(vm).voiceConnection = conn;
            getPrivate(vm).currentRoundId = "round-5";

            vm.disconnect();
            assert.strictEqual(getPrivate(vm).currentRoundId, null);
        });

        it("should not throw when connection is already null", () => {
            const client = createMockClient();
            const vm = new VoiceManager("guild-1", "vc-1", client);
            assert.doesNotThrow(() => vm.disconnect());
            assert.strictEqual(vm.state, VoiceState.DISCONNECTED);
        });

        it("should not throw when voice channel leave() throws", () => {
            const conn = createMockConnection();
            const client = createMockClient({ mockConnection: conn });
            client.getChannel = () => ({
                leave() {
                    throw new Error("leave failed");
                },
            });
            const vm = new VoiceManager("guild-1", "vc-1", client);
            getPrivate(vm).voiceConnection = conn;

            assert.doesNotThrow(() => vm.disconnect());
            assert.strictEqual(vm.state, VoiceState.DISCONNECTED);
        });
    });
});
