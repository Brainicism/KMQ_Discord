import * as discordUtils from "../../../helpers/discord_utils";
import GuildPreference from "../../../structures/guild_preference";
import KmqMember from "../../../structures/kmq_member";
import MessageContext from "../../../structures/message_context";
import ShuffleCommand from "../../../commands/game_options/shuffle";
import ShuffleType from "../../../enums/option_types/shuffle_type";
import assert from "assert";
import sinon from "sinon";

describe("shuffle command", () => {
    let guildPreference: GuildPreference;
    let sendErrorMessage: sinon.SinonStub;
    let sendOptionsMessage: sinon.SinonStub;
    const messageContext = new MessageContext(
        "",
        new KmqMember("dummy"),
        "123",
    );

    beforeEach(() => {
        guildPreference = new GuildPreference("123");
        sinon.stub(guildPreference, "updateGuildPreferences");
        sinon
            .stub(GuildPreference, "getGuildPreference")
            .resolves(guildPreference);

        sendErrorMessage = sinon.stub(discordUtils, "sendErrorMessage");
        sendOptionsMessage = sinon.stub(discordUtils, "sendOptionsMessage");
    });

    afterEach(() => {
        sinon.restore();
    });

    describe("playlist order", () => {
        it("is rejected when no playlist is set", async () => {
            await ShuffleCommand.updateOption(
                messageContext,
                ShuffleType.PLAYLIST_ORDER,
            );

            assert.ok(sendErrorMessage.calledOnce);
            assert.ok(sendOptionsMessage.notCalled);
            assert.strictEqual(
                guildPreference.gameOptions.shuffleType,
                ShuffleType.RANDOM,
            );
        });

        it("is accepted while a playlist is set", async () => {
            guildPreference.gameOptions.spotifyPlaylistID = "spotify|abc";
            await ShuffleCommand.updateOption(
                messageContext,
                ShuffleType.PLAYLIST_ORDER,
            );

            assert.ok(sendErrorMessage.notCalled);
            assert.ok(sendOptionsMessage.calledOnce);
            assert.strictEqual(
                guildPreference.gameOptions.shuffleType,
                ShuffleType.PLAYLIST_ORDER,
            );
        });
    });
});
