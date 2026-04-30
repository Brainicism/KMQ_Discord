import { VoiceState } from "../../../structures/voice_manager";
import assert from "assert";

describe("VoiceState enum", () => {
    it("should have all expected states", () => {
        assert.strictEqual(VoiceState.DISCONNECTED, "DISCONNECTED");
        assert.strictEqual(VoiceState.CONNECTING, "CONNECTING");
        assert.strictEqual(VoiceState.READY, "READY");
        assert.strictEqual(VoiceState.PLAYING, "PLAYING");
        assert.strictEqual(VoiceState.ERROR, "ERROR");
    });
});
