import * as discord_utils from "../../helpers/discord_utils";
import * as game_utils from "../../helpers/game_utils";
import * as management_utils from "../../helpers/management_utils";
import CommandPrechecks from "../../command_prechecks";
import GameSession from "../../structures/game_session";
import GameType from "../../enums/game_type";
import GuildPreference from "../../structures/guild_preference";
import KmqConfiguration from "../../kmq_configuration";
import KmqMember from "../../structures/kmq_member";
import ListeningSession from "../../structures/listening_session";
import MessageContext from "../../structures/message_context";
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

    const messageContext = new MessageContext(
        "faketextchannelid",
        new KmqMember("fakeuserid"),
        "fakeguilid",
        null
    );

    describe("inSessionCommandPrecheck", () => {
        describe("session is null", () => {
            it("should return false", () => {
                assert.equal(
                    CommandPrechecks.inSessionCommandPrecheck({
                        session: null,
                        messageContext,
                        errorMessage: "error",
                    }),
                    false
                );
            });
        });

        describe("listening session", () => {
            const listeningSession = new ListeningSession(
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
                            session: listeningSession,
                            messageContext,
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
                            session: listeningSession,
                            messageContext,
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
                GameType.ELIMINATION,
                true
            );

            const teamGameSession = new GameSession(
                new GuildPreference("12"),
                "12",
                "123",
                "1234",
                null,
                GameType.TEAMS,
                false
            );

            const classicGameSession = new GameSession(
                new GuildPreference("12"),
                "12",
                "123",
                "1234",
                null,
                GameType.CLASSIC,
                true
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
                                messageContext,
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
                                    messageContext,
                                    errorMessage: "error",
                                }),
                                false
                            );

                            assert.equal(
                                CommandPrechecks.inSessionCommandPrecheck({
                                    session: teamGameSession,
                                    messageContext,
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
                                    messageContext,
                                    errorMessage: "error",
                                }),
                                true
                            );

                            assert.equal(
                                CommandPrechecks.inSessionCommandPrecheck({
                                    session: teamGameSession,
                                    messageContext,
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
                                messageContext,
                                errorMessage: "error",
                            }),
                            false
                        );
                    });
                });
            });
        });
    });

    describe("notListeningPrecheck", () => {
        const listeningSession = new ListeningSession(
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
            GameType.CLASSIC,
            true
        );

        describe("session is null", () => {
            it("should return true", () => {
                assert.strictEqual(
                    CommandPrechecks.notListeningPrecheck({
                        session: null,
                        messageContext,
                    }),
                    true
                );
            });
        });

        describe("session is a listening session", () => {
            it("should return false", () => {
                assert.strictEqual(
                    CommandPrechecks.notListeningPrecheck({
                        session: listeningSession,
                        messageContext,
                    }),
                    false
                );
            });
        });

        describe("session is not a listening session", () => {
            it("should return true", () => {
                assert.strictEqual(
                    CommandPrechecks.notListeningPrecheck({
                        session: gameSession,
                        messageContext,
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
            GameType.CLASSIC,
            false
        );

        afterEach(() => {
            delete process.env.DEBUG_SERVER_ID;
        });

        describe("message originates in debug server", () => {
            it("should return true", () => {
                process.env.DEBUG_SERVER_ID = debugServerId;

                assert.strictEqual(
                    CommandPrechecks.debugServerPrecheck({
                        session: gameSession,
                        messageContext: {
                            ...messageContext,
                            guildID: debugServerId,
                        },
                    }),
                    true
                );
            });
        });

        describe("message does not originate in debug server", () => {
            it("should return false", () => {
                process.env.DEBUG_SERVER_ID = debugServerId;
                assert.strictEqual(
                    CommandPrechecks.debugServerPrecheck({
                        session: gameSession,
                        messageContext,
                    }),
                    false
                );
            });
        });
    });

    describe("maintenanceModePrecheck", () => {
        describe("maintenance mode is on", () => {
            before(() => {
                sandbox
                    .stub(KmqConfiguration.Instance, "maintenanceModeEnabled")
                    .callsFake(() => true);
            });

            after(() => {
                sandbox.restore();
            });

            it("should return false", () => {
                assert.strictEqual(
                    CommandPrechecks.maintenancePrecheck({
                        session: null,
                        messageContext,
                    }),
                    false
                );
            });
        });

        describe("maintenance mode is off", () => {
            after(() => {
                sandbox.restore();
            });

            before(() => {
                sandbox
                    .stub(KmqConfiguration.Instance, "maintenanceModeEnabled")
                    .callsFake(() => false);
            });

            it("should return true", () => {
                assert.strictEqual(
                    CommandPrechecks.maintenancePrecheck({
                        session: null,
                        messageContext,
                    }),
                    true
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
            GameType.CLASSIC,
            true
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
                        messageContext: {
                            ...messageContext,
                            textChannelID: debugChannelId,
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
                        messageContext,
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
            GameType.CLASSIC,
            true
        );

        describe("restart is scheduled", () => {
            it("should return false", async () => {
                sandbox
                    .stub(management_utils, "getTimeUntilRestart")
                    .callsFake(() => 5);

                assert.strictEqual(
                    await CommandPrechecks.notRestartingPrecheck({
                        messageContext,
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
                    .callsFake(() => null);

                assert.strictEqual(
                    await CommandPrechecks.notRestartingPrecheck({
                        messageContext,
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
            GameType.CLASSIC,
            false
        );

        describe("user is premium", () => {
            it("should return true", async () => {
                sandbox
                    .stub(game_utils, "isUserPremium")
                    .callsFake(() => Promise.resolve(true));

                assert.strictEqual(
                    await CommandPrechecks.premiumPrecheck({
                        messageContext,
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
                        messageContext,
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
            GameType.CLASSIC,
            false
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
                        messageContext,
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
                        messageContext: {
                            ...messageContext,
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
                        messageContext,
                    }),
                    false
                );
            });
        });
    });
});
