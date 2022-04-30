import * as discord_utils from "../../helpers/discord_utils";
import * as game_utils from "../../helpers/game_utils";
import * as management_utils from "../../helpers/management_utils";
import CommandPrechecks from "../../command_prechecks";
import Eris from "eris";
import GameSession from "../../structures/game_session";
import GameType from "../../enums/game_type";
import GuildPreference from "../../structures/guild_preference";
import MessageContext from "../../structures/message_context";
import MusicSession from "../../structures/music_session";
import assert from "assert";
import sinon from "sinon";

describe("command prechecks", () => {
    const sandbox = sinon.createSandbox();
    beforeEach(() => {
        sandbox.stub(discord_utils, "getDebugLogHeader").callsFake(() => "");
        sandbox.stub(discord_utils, "sendErrorMessage");
        sandbox.stub(MessageContext, "fromMessage").callsFake(() => null);
    });

    afterEach(() => {
        sandbox.restore();
    });

    const stubMessage = sandbox.createStubInstance(Eris.Message);

    describe("inSessionCommandPrecheck", () => {
        describe("session is null", () => {
            it("should return false", () => {
                assert.equal(
                    CommandPrechecks.inSessionCommandPrecheck({
                        session: null,
                        message: stubMessage,
                        errorMessage: "error",
                    }),
                    false
                );
            });
        });

        describe("music session", () => {
            const musicSession = new MusicSession(
                new GuildPreference("12"),
                "123",
                "1234",
                "12345",
                null
            );

            describe("user and bot are in the same vc", () => {
                it("should return true", () => {
                    sandbox
                        .stub(discord_utils, "areUserAndBotInSameVoiceChannel")
                        .callsFake(() => true);

                    assert.equal(
                        CommandPrechecks.inSessionCommandPrecheck({
                            session: musicSession,
                            message: stubMessage,
                            errorMessage: "error",
                        }),
                        true
                    );
                });
            });

            describe("user and bot are not in the same vc", () => {
                it("should return false", () => {
                    sandbox
                        .stub(discord_utils, "areUserAndBotInSameVoiceChannel")
                        .callsFake(() => false);

                    assert.equal(
                        CommandPrechecks.inSessionCommandPrecheck({
                            session: musicSession,
                            message: stubMessage,
                            errorMessage: "error",
                        }),
                        false
                    );
                });
            });
        });

        describe("game session", () => {
            const eliminationGameSession = new GameSession(
                new GuildPreference("12"),
                "12",
                "123",
                "1234",
                null,
                GameType.ELIMINATION
            );

            const teamGameSession = new GameSession(
                new GuildPreference("12"),
                "12",
                "123",
                "1234",
                null,
                GameType.TEAMS
            );

            const classicGameSession = new GameSession(
                new GuildPreference("12"),
                "12",
                "123",
                "1234",
                null,
                GameType.CLASSIC
            );

            describe("in the same voice channel", () => {
                it("should return true", () => {
                    sandbox
                        .stub(discord_utils, "areUserAndBotInSameVoiceChannel")
                        .callsFake(() => true);
                    for (const session of [
                        classicGameSession,
                        eliminationGameSession,
                        teamGameSession,
                    ]) {
                        assert.equal(
                            CommandPrechecks.inSessionCommandPrecheck({
                                session,
                                message: stubMessage,
                                errorMessage: "error",
                            }),
                            true
                        );
                    }
                });
            });

            describe("not in same voice channel", () => {
                beforeEach(() => {
                    sandbox
                        .stub(discord_utils, "areUserAndBotInSameVoiceChannel")
                        .callsFake(() => false);
                });

                describe("elimination or team mode", () => {
                    describe("initialized session", () => {
                        it("should return false", () => {
                            eliminationGameSession.sessionInitialized = true;
                            teamGameSession.sessionInitialized = true;
                            assert.equal(
                                CommandPrechecks.inSessionCommandPrecheck({
                                    session: eliminationGameSession,
                                    message: stubMessage,
                                    errorMessage: "error",
                                }),
                                false
                            );

                            assert.equal(
                                CommandPrechecks.inSessionCommandPrecheck({
                                    session: teamGameSession,
                                    message: stubMessage,
                                    errorMessage: "error",
                                }),
                                false
                            );
                        });
                    });

                    describe("uninitialized session", () => {
                        it("should return true", () => {
                            eliminationGameSession.sessionInitialized = false;
                            teamGameSession.sessionInitialized = false;
                            assert.equal(
                                CommandPrechecks.inSessionCommandPrecheck({
                                    session: eliminationGameSession,
                                    message: stubMessage,
                                    errorMessage: "error",
                                }),
                                true
                            );

                            assert.equal(
                                CommandPrechecks.inSessionCommandPrecheck({
                                    session: teamGameSession,
                                    message: stubMessage,
                                    errorMessage: "error",
                                }),
                                true
                            );
                        });
                    });
                });

                describe("classic mode", () => {
                    it("should return false", () => {
                        assert.equal(
                            CommandPrechecks.inSessionCommandPrecheck({
                                session: classicGameSession,
                                message: stubMessage,
                                errorMessage: "error",
                            }),
                            false
                        );
                    });
                });
            });
        });
    });

    describe("notMusicPrecheck", () => {
        const musicSession = new MusicSession(
            new GuildPreference("12"),
            "123",
            "1234",
            "1235",
            null
        );

        const gameSession = new GameSession(
            new GuildPreference("12"),
            "123",
            "1234",
            "1235",
            null,
            GameType.CLASSIC
        );

        describe("session is null", () => {
            it("should return true", () => {
                assert.strictEqual(
                    CommandPrechecks.notMusicPrecheck({
                        session: null,
                        message: stubMessage,
                    }),
                    true
                );
            });
        });

        describe("session is a music session", () => {
            it("should return false", () => {
                assert.strictEqual(
                    CommandPrechecks.notMusicPrecheck({
                        session: musicSession,
                        message: stubMessage,
                    }),
                    false
                );
            });
        });

        describe("session is not a music session", () => {
            it("should return true", () => {
                assert.strictEqual(
                    CommandPrechecks.notMusicPrecheck({
                        session: gameSession,
                        message: stubMessage,
                    }),
                    true
                );
            });
        });
    });

    describe("debugServerPrecheck", () => {
        const debugServerId = "69420";
        const gameSession = new GameSession(
            new GuildPreference("12"),
            "123",
            "1234",
            debugServerId,
            null,
            GameType.CLASSIC
        );

        afterEach(() => {
            delete process.env.DEBUG_SERVER_ID;
        });

        describe("message originates in debug server", () => {
            it("should return true", () => {
                process.env.DEBUG_SERVER_ID = debugServerId;
                stubMessage.guildID = debugServerId;

                assert.strictEqual(
                    CommandPrechecks.debugServerPrecheck({
                        session: gameSession,
                        message: stubMessage,
                    }),
                    true
                );
            });
        });

        describe("message does not originate in debug server", () => {
            it("should return false", () => {
                stubMessage.guildID = "5";
                process.env.DEBUG_SERVER_ID = debugServerId;
                sandbox.stub(stubMessage, "guildID").value("123456");
                assert.strictEqual(
                    CommandPrechecks.debugServerPrecheck({
                        session: gameSession,
                        message: stubMessage,
                    }),
                    false
                );
            });
        });
    });

    describe("debugChannelPrecheck", () => {
        const debugChannelId = "69420";
        const gameSession = new GameSession(
            new GuildPreference("12"),
            debugChannelId,
            "1234",
            "12345",
            null,
            GameType.CLASSIC
        );

        afterEach(() => {
            delete process.env.DEBUG_TEXT_CHANNEL_ID;
        });

        describe("message originates in debug channel", () => {
            it("should return true", () => {
                process.env.DEBUG_TEXT_CHANNEL_ID = debugChannelId;

                assert.strictEqual(
                    CommandPrechecks.debugChannelPrecheck({
                        session: gameSession,
                        message: <any>{
                            channel: {
                                id: debugChannelId,
                            },
                        },
                    }),
                    true
                );
            });
        });

        describe("message does not originate in debug channel", () => {
            it("should return true", () => {
                process.env.DEBUG_TEXT_CHANNEL_ID = debugChannelId;

                assert.strictEqual(
                    CommandPrechecks.debugChannelPrecheck({
                        session: gameSession,
                        message: <any>{
                            channel: {
                                id: "1234",
                            },
                        },
                    }),
                    false
                );
            });
        });
    });

    describe("notRestartingPrecheck", () => {
        const gameSession = new GameSession(
            new GuildPreference("12"),
            "123",
            "1234",
            "12345",
            null,
            GameType.CLASSIC
        );

        describe("restart is scheduled", () => {
            it("should return false", async () => {
                sandbox
                    .stub(management_utils, "getTimeUntilRestart")
                    .callsFake(() => Promise.resolve(5));

                assert.strictEqual(
                    await CommandPrechecks.notRestartingPrecheck({
                        message: stubMessage,
                        session: gameSession,
                    }),
                    false
                );
            });
        });

        describe("restart is not scheduled", () => {
            it("should return true", async () => {
                sandbox
                    .stub(management_utils, "getTimeUntilRestart")
                    .callsFake(() => Promise.resolve(null));

                assert.strictEqual(
                    await CommandPrechecks.notRestartingPrecheck({
                        message: stubMessage,
                        session: gameSession,
                    }),
                    true
                );
            });
        });
    });

    describe("premiumPrecheck", () => {
        const gameSession = new GameSession(
            new GuildPreference("12"),
            "123",
            "1234",
            "12345",
            null,
            GameType.CLASSIC
        );

        describe("user is premium", () => {
            it("should return true", async () => {
                sandbox
                    .stub(game_utils, "isUserPremium")
                    .callsFake(() => Promise.resolve(true));

                assert.strictEqual(
                    await CommandPrechecks.premiumPrecheck({
                        message: <any>{
                            author: {
                                id: "1234",
                            },
                        },
                        session: gameSession,
                    }),
                    true
                );
            });
        });

        describe("user is not premium", () => {
            it("should return false", async () => {
                sandbox
                    .stub(game_utils, "isUserPremium")
                    .callsFake(() => Promise.resolve(false));

                assert.strictEqual(
                    await CommandPrechecks.premiumPrecheck({
                        message: <any>{
                            author: {
                                id: "1234",
                            },
                        },
                        session: gameSession,
                    }),
                    false
                );
            });
        });
    });

    describe("premiumOrDebugServerPrecheck", () => {
        const debugServerId = "123456789";
        const gameSession = new GameSession(
            new GuildPreference("12"),
            "123",
            "1234",
            "12345",
            null,
            GameType.CLASSIC
        );

        afterEach(() => {
            delete process.env.DEBUG_SERVER_ID;
        });

        describe("user is premium", () => {
            it("should return true", async () => {
                sandbox
                    .stub(game_utils, "isUserPremium")
                    .callsFake(() => Promise.resolve(true));

                assert.strictEqual(
                    await CommandPrechecks.premiumOrDebugServerPrecheck({
                        message: <any>{
                            author: {
                                id: "1234",
                            },
                        },
                        session: gameSession,
                    }),
                    true
                );
            });
        });

        describe("message originates in debug server", () => {
            it("should return true", async () => {
                process.env.DEBUG_SERVER_ID = debugServerId;

                assert.strictEqual(
                    await CommandPrechecks.premiumOrDebugServerPrecheck({
                        session: gameSession,
                        message: <any>{
                            author: {
                                id: "1234",
                            },
                            guildID: debugServerId,
                        },
                    }),
                    true
                );
            });
        });

        describe("user is not premiun, nor does message originate in debug server", () => {
            it("should return false", async () => {
                process.env.DEBUG_SERVER_ID = "abc";
                sandbox
                    .stub(game_utils, "isUserPremium")
                    .callsFake(() => Promise.resolve(false));

                assert.strictEqual(
                    await CommandPrechecks.premiumOrDebugServerPrecheck({
                        session: gameSession,
                        message: <any>{
                            author: {
                                id: "1234",
                            },
                        },
                    }),
                    false
                );
            });
        });
    });
});
