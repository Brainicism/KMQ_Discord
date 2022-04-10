import assert from "assert";
import GameSession from "../../structures/game_session";
import GuildPreference from "../../structures/guild_preference";
import KmqMember from "../../structures/kmq_member";
import sinon from "sinon";
import { GameType } from "../../types";
import { state } from "../../kmq_worker";
import * as discord_utils from "../../helpers/discord_utils";
import * as game_utils from "../../helpers/game_utils";
import * as utils from "../../helpers/utils";
import Eris, { Collection } from "eris";
import KmqClient from "../../kmq_client";

describe("startRound", function () {
    let gameSession: GameSession;
    let prepareRoundSpy: sinon.SinonSpy;
    let voiceChannelStub: Eris.VoiceChannel;
    let playSongSpy: sinon.SinonSpy;
    let ensureVoiceConnectionSpy: sinon.SinonSpy;
    let endSessionStub: sinon.SinonSpy;
    const sandbox = sinon.createSandbox();
    beforeEach(() => {
        sandbox.stub(utils, "delay");

        voiceChannelStub = sinon.createStubInstance(Eris.VoiceChannel);
        voiceChannelStub.voiceMembers = new Collection(Eris.Member);
        const x = sinon.createStubInstance(KmqClient);
        x.getChannel.callsFake(() => voiceChannelStub);
        state.client = x;
        sandbox.stub(discord_utils, "getNumParticipants").callsFake(() => 1);
        sandbox.stub(discord_utils, "getDebugLogHeader").callsFake(() => "");

        gameSession = new GameSession(
            "123",
            "123",
            "123",
            new KmqMember("jisoo", "jisoo#4747", "url", "123"),
            GameType.CLASSIC
        );

        prepareRoundSpy = sinon.spy(gameSession, <any>"prepareRound");
        playSongSpy = sinon.spy(gameSession, <any>"playSong");
        ensureVoiceConnectionSpy = sinon.spy(
            game_utils,
            "ensureVoiceConnection"
        );

        endSessionStub = sinon.stub(gameSession, "endSession");
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe("happy path", () => {
        it("should start the round successfully", async () => {
            const guildPreference = new GuildPreference("test");
            voiceChannelStub.voiceMembers.add({ id: "1" } as any);
            await gameSession.startRound(guildPreference, null);
            assert.ok(prepareRoundSpy.called);
            assert.ok(ensureVoiceConnectionSpy.called);
            assert.ok(playSongSpy.called);
            assert.ok(endSessionStub.notCalled);
            assert.ok(gameSession.songSelector.getSongs().countBeforeLimit > 0);
        });
    });
});
