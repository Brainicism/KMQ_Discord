/* eslint-disable no-await-in-loop */
import * as discord_utils from "../../helpers/discord_utils";
import * as game_utils from "../../helpers/game_utils";
import * as utils from "../../helpers/utils";
import AnswerType from "../../enums/option_types/answer_type";
import Eris, { Collection } from "eris";
import GameSession from "../../structures/game_session";
import GameType from "../../enums/game_type";
import GuildPreference from "../../structures/guild_preference";
import KmqClient from "../../kmq_client";
import KmqMember from "../../structures/kmq_member";
import MessageContext from "../../structures/message_context";
import Session from "../../structures/session";
import State from "../../state";
import assert from "assert";
import sinon from "sinon";

function getMockGuildPreference(): GuildPreference {
    const guildPreference = new GuildPreference("test");
    sinon.stub(guildPreference, "updateGuildPreferences");
    return guildPreference;
}

describe("game session", () => {
    describe("startRound", () => {
        let guildPreference: GuildPreference;
        let gameSession: GameSession;
        let prepareRoundSpy: sinon.SinonSpy;
        let voiceChannelStub: Eris.VoiceChannel;
        let playSongSpy: sinon.SinonSpy;
        let ensureVoiceConnectionSpy: sinon.SinonSpy;
        let endSessionSpy: sinon.SinonSpy;
        let endRoundStub: sinon.SinonSpy;
        let voiceConnection: sinon.SinonStubbedInstance<Eris.VoiceConnection>;
        const sandbox = sinon.createSandbox();
        beforeEach(async () => {
            sandbox.stub(utils, "delay");
            guildPreference = getMockGuildPreference();
            await guildPreference.setAnswerType(AnswerType.TYPING);
            voiceChannelStub = sandbox.createStubInstance(Eris.VoiceChannel);
            voiceChannelStub.voiceMembers = new Collection(Eris.Member);
            const x = sandbox.createStubInstance(KmqClient);
            x.getChannel.callsFake(() => voiceChannelStub as Eris.AnyChannel);

            voiceConnection = sandbox.createStubInstance(Eris.VoiceConnection);
            State.client = x;
            State.client.user = sandbox.createStubInstance(Eris.ExtendedUser);
            State.client.user.id = "5";
            State.client.voiceConnections = sandbox.createStubInstance(
                Eris.VoiceConnectionManager
            );

            sandbox
                .stub(discord_utils, "getNumParticipants")
                .callsFake(() => 1);

            sandbox
                .stub(discord_utils, "getDebugLogHeader")
                .callsFake(() => "");

            gameSession = new GameSession(
                guildPreference,
                "123",
                "123",
                "123",
                new KmqMember("123"),
                GameType.CLASSIC,
                true
            );

            sandbox.stub(Session, "getSession").callsFake(() => gameSession);
            prepareRoundSpy = sandbox.spy(gameSession, <any>"prepareRound");
            sandbox
                .stub(gameSession, <any>"guessEligible")
                .callsFake(() => true);
            playSongSpy = sandbox.stub(gameSession, <any>"playSong");
            ensureVoiceConnectionSpy = sandbox.spy(
                game_utils,
                "ensureVoiceConnection"
            );

            endSessionSpy = sandbox.spy(gameSession, "endSession");
            endRoundStub = sandbox.stub(gameSession, "endRound");
        });

        afterEach(() => {
            sandbox.restore();
        });

        describe("happy path", () => {
            it("should complete successfully", async () => {
                // round starts successfully
                voiceChannelStub.voiceMembers.add({ id: "1" } as any);

                await gameSession.startRound(
                    new MessageContext("id", null, "guild_id")
                );
                gameSession.connection = voiceConnection;
                assert.ok(prepareRoundSpy.called);
                assert.ok(ensureVoiceConnectionSpy.called);
                assert.ok(playSongSpy.called);
                assert.ok(endSessionSpy.notCalled);
                assert.ok(endRoundStub.notCalled);
                assert.ok(
                    gameSession.songSelector.getSongs().countBeforeLimit > 0
                );
                assert(gameSession.round);

                const correctGuess = gameSession.round.acceptedSongAnswers[0];
                const gameStarter = new KmqMember("123");
                const messageContext = new MessageContext(
                    "",
                    gameStarter,
                    "123",
                    ""
                );

                // incorrect guesses
                for (let i = 0; i < 5; i++) {
                    await gameSession.guessSong(
                        messageContext,
                        `badguess${i}`,
                        Date.now()
                    );
                    assert.ok(endRoundStub.notCalled);
                }

                // correct guess
                await gameSession.guessSong(
                    messageContext,
                    correctGuess,
                    Date.now()
                );

                assert.ok(
                    endRoundStub.calledWith(messageContext, {
                        correct: true,
                        correctGuessers: gameSession.round.correctGuessers,
                    })
                );

                // end session
                const sendEndGameMessageStub = sandbox.stub(
                    gameSession,
                    "sendEndGameMessage"
                );

                await gameSession.endSession("Initiated by test");
                assert.ok(gameSession.finished);

                assert.ok(sendEndGameMessageStub.called);
            });
        });

        describe("streaks happy path", () => {
            it("should keep track of a streak", async () => {
                // round starts successfully
                voiceChannelStub.voiceMembers.add({ id: "1" } as any);

                for (let i = 0; i < 6; i++) {
                    await gameSession.startRound(
                        new MessageContext("id", null, "guild_id")
                    );
                    gameSession.connection = voiceConnection;
                    assert.ok(prepareRoundSpy.called);
                    assert.ok(ensureVoiceConnectionSpy.called);
                    assert.ok(playSongSpy.called);
                    assert.ok(endSessionSpy.notCalled);
                    assert.ok(endRoundStub.notCalled);
                    assert.ok(
                        gameSession.songSelector.getSongs().countBeforeLimit > 0
                    );
                    assert(gameSession.round);

                    const correctGuess =
                        gameSession.round.acceptedSongAnswers[0];

                    const gameStarter = new KmqMember("123");
                    const messageContext = new MessageContext(
                        "",
                        gameStarter,
                        "123",
                        ""
                    );

                    // incorrect guesses
                    for (let j = 0; j < 5; j++) {
                        await gameSession.guessSong(
                            messageContext,
                            `badguess${j}`,
                            Date.now()
                        );
                        assert.ok(endRoundStub.notCalled);
                    }

                    // correct guess
                    await gameSession.guessSong(
                        messageContext,
                        correctGuess,
                        Date.now()
                    );

                    assert.ok(
                        endRoundStub.calledWith(messageContext, {
                            correct: true,
                            correctGuessers: gameSession.round.correctGuessers,
                        })
                    );

                    // Update gameStarter's points
                    gameStarter.pointsAwarded += 1;
                    assert.deepStrictEqual(gameSession.round.correctGuessers, [
                        gameStarter,
                    ]);
                    const lastGuesser = (gameSession as any).lastGuesser;
                    assert.strictEqual(lastGuesser.streak, i + 1);
                    assert.strictEqual(lastGuesser.userID, gameStarter.id);
                }

                // end session
                const sendEndGameMessageStub = sandbox.stub(
                    gameSession,
                    "sendEndGameMessage"
                );

                await gameSession.endSession("Initiated by test");
                assert.ok(gameSession.finished);

                assert.ok(sendEndGameMessageStub.called);
            });
        });

        describe("streak reset path", () => {
            it("should reset the streak and start a new one", async () => {
                // round starts successfully
                voiceChannelStub.voiceMembers.add({ id: "1" } as any);

                for (let i = 0; i < 10; i++) {
                    await gameSession.startRound(
                        new MessageContext("id", null, "guild_id")
                    );
                    gameSession.connection = voiceConnection;
                    assert.ok(prepareRoundSpy.called);
                    assert.ok(ensureVoiceConnectionSpy.called);
                    assert.ok(playSongSpy.called);
                    assert.ok(endSessionSpy.notCalled);
                    assert.ok(endRoundStub.notCalled);
                    assert.ok(
                        gameSession.songSelector.getSongs().countBeforeLimit > 0
                    );
                    assert(gameSession.round);

                    const correctGuess =
                        gameSession.round.acceptedSongAnswers[0];

                    const gameStarter = new KmqMember("123");
                    const gameStarterContext = new MessageContext(
                        "",
                        gameStarter,
                        "123",
                        ""
                    );

                    const otherGuesser = new KmqMember("456");
                    const otherGuesserContext = new MessageContext(
                        "",
                        otherGuesser,
                        "456",
                        ""
                    );

                    // incorrect guesses
                    for (let j = 0; j < 5; j++) {
                        await gameSession.guessSong(
                            gameStarterContext,
                            `badguess${j}`,
                            Date.now()
                        );
                        assert.ok(endRoundStub.notCalled);
                    }

                    for (let j = 0; j < 5; j++) {
                        await gameSession.guessSong(
                            otherGuesserContext,
                            `badguess${j}`,
                            Date.now()
                        );
                        assert.ok(endRoundStub.notCalled);
                    }

                    if (i < 3) {
                        // gameStarter correct guess
                        await gameSession.guessSong(
                            gameStarterContext,
                            correctGuess,
                            Date.now()
                        );

                        assert.ok(
                            endRoundStub.calledWith(gameStarterContext, {
                                correct: true,
                                correctGuessers:
                                    gameSession.round.correctGuessers,
                            })
                        );

                        // Update gameStarter's points
                        gameStarter.pointsAwarded += 1;
                        assert.deepStrictEqual(
                            gameSession.round.correctGuessers,
                            [gameStarter]
                        );
                        // const lastGuesser = (gameSession as any).lastGuesser;
                        // assert.strictEqual(lastGuesser.streak, i + 1);
                        // assert.strictEqual(lastGuesser.userID, gameStarter.id);
                    } else {
                        // otherGuesser correct guess
                        await gameSession.guessSong(
                            otherGuesserContext,
                            correctGuess,
                            Date.now()
                        );

                        assert.ok(
                            endRoundStub.calledWith(gameStarterContext, {
                                correct: true,
                                correctGuessers:
                                    gameSession.round.correctGuessers,
                            })
                        );

                        // Update otherGuesser's points
                        otherGuesser.pointsAwarded += 1;
                        assert.deepStrictEqual(
                            gameSession.round.correctGuessers,
                            [otherGuesser]
                        );
                        const lastGuesser = (gameSession as any).lastGuesser;
                        assert.strictEqual(lastGuesser.streak, i - 3 + 1);
                        assert.strictEqual(lastGuesser.userID, otherGuesser.id);
                    }
                }

                // end session
                const sendEndGameMessageStub = sandbox.stub(
                    gameSession,
                    "sendEndGameMessage"
                );

                await gameSession.endSession("Initiated by test");
                assert.ok(gameSession.finished);

                assert.ok(sendEndGameMessageStub.called);
            });
        });
    });
});
