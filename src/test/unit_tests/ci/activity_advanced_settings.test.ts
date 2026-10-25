import GuildPreference from "../../../structures/guild_preference";
import assert from "assert";
import sendActivityRequest from "../helpers/activity_ipc_harness";
import sinon from "sinon";

describe("activity advanced settings", () => {
    const sandbox = sinon.createSandbox();
    let guildPreference: GuildPreference;

    const setOption = (
        args: Record<string, unknown>,
    ): Promise<{ ok: boolean; reason?: string }> =>
        sendActivityRequest("setOption", {
            guildID: "123",
            userID: "456",
            ...args,
        });

    beforeEach(() => {
        guildPreference = new GuildPreference("123");
        sandbox.stub(guildPreference, "updateGuildPreferences");
        sandbox
            .stub(GuildPreference, "getGuildPreference")
            .resolves(guildPreference);
    });

    afterEach(() => {
        sandbox.restore();
    });

    it("applies each advanced delay to the guild preference", async () => {
        assert.deepStrictEqual(
            await setOption({
                kind: "advanced",
                setting: "multiguess_delay",
                value: 4.5,
            }),
            { ok: true },
        );

        assert.deepStrictEqual(
            await setOption({
                kind: "advanced",
                setting: "song_start_delay",
                value: 0,
            }),
            { ok: true },
        );

        assert.strictEqual(guildPreference.getMultiGuessDelay(), 4.5);
        assert.strictEqual(guildPreference.getSongStartDelay(), 0);
    });
});
