import GuildPreference from "../../../structures/guild_preference";
import SeekType from "../../../enums/option_types/seek_type";
import assert from "assert";
import sendActivityRequest from "../helpers/activity_ipc_harness";
import sinon from "sinon";

describe("activity set option while a playlist is set", () => {
    let guildPreference: GuildPreference;
    const sandbox = sinon.createSandbox();

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
        guildPreference.gameOptions.spotifyPlaylistID = "spotify|abc";
    });

    afterEach(() => {
        sandbox.restore();
    });

    it("rejects song-pool options the playlist manages", async () => {
        const genderBefore = [...guildPreference.gameOptions.gender];
        const reply = await setOption({ kind: "gender", genders: ["male"] });

        assert.deepStrictEqual(reply, {
            ok: false,
            reason: "playlist_managed",
        });

        assert.deepStrictEqual(
            guildPreference.gameOptions.gender,
            genderBefore,
        );
    });

    it("still accepts options a playlist doesn't manage", async () => {
        const reply = await setOption({
            kind: "seek",
            seek: SeekType.BEGINNING,
        });

        assert.deepStrictEqual(reply, { ok: true });
        assert.strictEqual(
            guildPreference.gameOptions.seekType,
            SeekType.BEGINNING,
        );
    });
});
