import * as discord_utils from "../../../helpers/discord_utils";
import * as game_utils from "../../../helpers/game_utils";
import * as utils from "../../../helpers/utils";
import Eris, { Collection } from "eris";
import GuildPreference from "../../../structures/guild_preference";
import KmqClient from "../../../kmq_client";
import KmqMember from "../../../structures/kmq_member";
import ListeningSession from "../../../structures/listening_session";
import MessageContext from "../../../structures/message_context";
import Session from "../../../structures/session";
import State from "../../../state";
import assert from "assert";
import sinon from "sinon";

const mockMessageContext = new MessageContext(
    "dummy",
    new KmqMember("dummy"),
    "dummy",
);

function getMockGuildPreference(): GuildPreference {
    const guildPreference = new GuildPreference("test");
    sinon.stub(guildPreference, "updateGuildPreferences");
    return guildPreference;
}

describe("listening session", () => {
    let guildPreference: GuildPreference;
    describe("startRound", () => {
        let listeningSession: ListeningSession;
        let prepareRoundSpy: sinon.SinonSpy;
        let voiceChannelStub: Eris.VoiceChannel;
        let playSongSpy: sinon.SinonSpy;
        let ensureVoiceConnectionSpy: sinon.SinonSpy;
        let endSessionStub: sinon.SinonSpy;
        const sandbox = sinon.createSandbox();
        beforeEach(() => {
            sandbox.stub(utils, "delay");
            guildPreference = getMockGuildPreference();
            voiceChannelStub = sandbox.createStubInstance(Eris.VoiceChannel);
            voiceChannelStub.voiceMembers = new Collection(Eris.Member);
            const x = sandbox.createStubInstance(KmqClient);
            x.getChannel.callsFake(() => voiceChannelStub as Eris.AnyChannel);
            State.client = x;
            sandbox
                .stub(discord_utils, "getNumParticipants")
                .callsFake(() => 1);

            sandbox
                .stub(discord_utils, "getDebugLogHeader")
                .callsFake(() => "");

            listeningSession = new ListeningSession(
                guildPreference,
                "123",
                "123",
                "123",
                new KmqMember("123"),
            );

            sandbox
                .stub(Session, "getSession")
                .callsFake(() => listeningSession);

            prepareRoundSpy = sandbox.spy(
                listeningSession,
                <any>"prepareRound",
            );
            playSongSpy = sandbox.stub(listeningSession, <any>"playSong");
            ensureVoiceConnectionSpy = sandbox.spy(
                game_utils,
                "ensureVoiceConnection",
            );

            endSessionStub = sandbox.stub(listeningSession, "endSession");
        });

        afterEach(() => {
            sandbox.restore();
        });

        describe("happy path", () => {
            it("should start the round successfully", async () => {
                voiceChannelStub.voiceMembers.add({ id: "1" } as any);
                await listeningSession.startRound(mockMessageContext);
                assert.ok(prepareRoundSpy.called);
                assert.ok(ensureVoiceConnectionSpy.called);
                assert.ok(playSongSpy.called);
                assert.ok(endSessionStub.notCalled);
                assert.ok(
                    guildPreference.songSelector.getSongs().countBeforeLimit >
                        0,
                );
            });
        });
    });
});
