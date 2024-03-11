import * as discord_utils from "../../helpers/discord_utils";
import * as management_utils from "../../helpers/management_utils";
import AnswerType from "../../enums/option_types/answer_type";
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
    const mockKmqMember = new KmqMember("dummy");
    beforeEach(() => {
        sandbox.stub(discord_utils, "getDebugLogHeader").callsFake(() => "");
        sandbox.stub(discord_utils, "sendErrorMessage");
    });

    afterEach(() => {
        sandbox.restore();
    });

    const messageContext = new MessageContext(
        "faketextchannelid",
        new KmqMember("fakeuserid"),
        "fakeguildid",
    );

    const mockGameSession = new GameSession(
        new GuildPreference("dummy"),
        "dummy",
        "dummy",
        "dummy",
        new KmqMember("dummy"),
        GameType.CLASSIC,
    );

    describe("inSessionCommandPrecheck", () => {
        describe("session is null", () => {
            it("should return false", async () => {
                assert.equal(
                    await CommandPrechecks.inSessionCommandPrecheck({
                        session: null,
                        messageContext,
                    }),
                    false,
                );
            });
        });

        describe("listening session", () => {
            const listeningSession = new ListeningSession(
                new GuildPreference("12"),
                "123",
                "1234",
                "12345",
                mockKmqMember,
            );

            describe("user and bot are in the same vc", () => {
                it("should return true", async () => {
                    sandbox
                        .stub(discord_utils, "areUserAndBotInSameVoiceChannel")
                        .callsFake(() => true);

                    assert.equal(
                        await CommandPrechecks.inSessionCommandPrecheck({
                            session: listeningSession,
                            messageContext,
                        }),
                        true,
                    );
                });
            });

            describe("user and bot are not in the same vc", () => {
                it("should return false", async () => {
                    sandbox
                        .stub(discord_utils, "areUserAndBotInSameVoiceChannel")
                        .callsFake(() => false);

                    assert.equal(
                        await CommandPrechecks.inSessionCommandPrecheck({
                            session: listeningSession,
                            messageContext,
                        }),
                        false,
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
                mockKmqMember,
                GameType.ELIMINATION,
            );

            const teamGameSession = new GameSession(
                new GuildPreference("12"),
                "12",
                "123",
                "1234",
                mockKmqMember,
                GameType.TEAMS,
            );

            const classicGameSession = new GameSession(
                new GuildPreference("12"),
                "12",
                "123",
                "1234",
                mockKmqMember,
                GameType.CLASSIC,
            );

            describe("in the same voice channel", () => {
                it("should return true", async () => {
                    sandbox
                        .stub(discord_utils, "areUserAndBotInSameVoiceChannel")
                        .callsFake(() => true);
                    for (const session of [
                        classicGameSession,
                        eliminationGameSession,
                        teamGameSession,
                    ]) {
                        assert.equal(
                            // eslint-disable-next-line no-await-in-loop
                            await CommandPrechecks.inSessionCommandPrecheck({
                                session,
                                messageContext,
                            }),
                            true,
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
                        it("should return false", async () => {
                            eliminationGameSession.sessionInitialized = true;
                            teamGameSession.sessionInitialized = true;
                            assert.equal(
                                await CommandPrechecks.inSessionCommandPrecheck(
                                    {
                                        session: eliminationGameSession,
                                        messageContext,
                                    },
                                ),
                                false,
                            );

                            assert.equal(
                                await CommandPrechecks.inSessionCommandPrecheck(
                                    {
                                        session: teamGameSession,
                                        messageContext,
                                    },
                                ),
                                false,
                            );
                        });
                    });

                    describe("uninitialized session", () => {
                        it("should return true", async () => {
                            eliminationGameSession.sessionInitialized = false;
                            teamGameSession.sessionInitialized = false;
                            assert.equal(
                                await CommandPrechecks.inSessionCommandPrecheck(
                                    {
                                        session: eliminationGameSession,
                                        messageContext,
                                    },
                                ),
                                true,
                            );

                            assert.equal(
                                await CommandPrechecks.inSessionCommandPrecheck(
                                    {
                                        session: teamGameSession,
                                        messageContext,
                                    },
                                ),
                                true,
                            );
                        });
                    });
                });

                describe("classic mode", () => {
                    it("should return false", async () => {
                        assert.equal(
                            await CommandPrechecks.inSessionCommandPrecheck({
                                session: classicGameSession,
                                messageContext,
                            }),
                            false,
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
            mockKmqMember,
        );

        const gameSession = new GameSession(
            new GuildPreference("12"),
            "123",
            "1234",
            "1235",
            mockKmqMember,
            GameType.CLASSIC,
        );

        describe("session is null", () => {
            it("should return true", async () => {
                assert.strictEqual(
                    await CommandPrechecks.notListeningPrecheck({
                        session: mockGameSession,
                        messageContext,
                    }),
                    true,
                );
            });
        });

        describe("session is a listening session", () => {
            it("should return false", async () => {
                assert.strictEqual(
                    await CommandPrechecks.notListeningPrecheck({
                        session: listeningSession,
                        messageContext,
                    }),
                    false,
                );
            });
        });

        describe("session is not a listening session", () => {
            it("should return true", async () => {
                assert.strictEqual(
                    await CommandPrechecks.notListeningPrecheck({
                        session: gameSession,
                        messageContext,
                    }),
                    true,
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
            mockKmqMember,
            GameType.CLASSIC,
        );

        afterEach(() => {
            delete process.env.DEBUG_SERVER_ID;
        });

        describe("message originates in debug server", () => {
            it("should return true", async () => {
                process.env.DEBUG_SERVER_ID = debugServerId;

                assert.strictEqual(
                    await CommandPrechecks.debugServerPrecheck({
                        session: gameSession,
                        messageContext: {
                            ...messageContext,
                            guildID: debugServerId,
                        },
                    }),
                    true,
                );
            });
        });

        describe("message does not originate in debug server", () => {
            it("should return false", async () => {
                process.env.DEBUG_SERVER_ID = debugServerId;
                assert.strictEqual(
                    await CommandPrechecks.debugServerPrecheck({
                        session: gameSession,
                        messageContext,
                    }),
                    false,
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

            it("should return false", async () => {
                assert.strictEqual(
                    await CommandPrechecks.maintenancePrecheck({
                        session: mockGameSession,
                        messageContext,
                    }),
                    false,
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

            it("should return true", async () => {
                assert.strictEqual(
                    await CommandPrechecks.maintenancePrecheck({
                        session: mockGameSession,
                        messageContext,
                    }),
                    true,
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
            mockKmqMember,
            GameType.CLASSIC,
        );

        afterEach(() => {
            delete process.env.DEBUG_TEXT_CHANNEL_ID;
        });

        describe("message originates in debug channel", () => {
            it("should return true", async () => {
                process.env.DEBUG_TEXT_CHANNEL_ID = debugChannelId;

                assert.strictEqual(
                    await CommandPrechecks.debugChannelPrecheck({
                        session: gameSession,
                        messageContext: {
                            ...messageContext,
                            textChannelID: debugChannelId,
                        },
                    }),
                    true,
                );
            });
        });

        describe("message does not originate in debug channel", () => {
            it("should return true", async () => {
                process.env.DEBUG_TEXT_CHANNEL_ID = debugChannelId;

                assert.strictEqual(
                    await CommandPrechecks.debugChannelPrecheck({
                        session: gameSession,
                        messageContext,
                    }),
                    false,
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
            mockKmqMember,
            GameType.CLASSIC,
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
                    false,
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
                    true,
                );
            });
        });
    });

    describe("notPlaylistPrecheck", () => {
        const GUILD_ID = "123";

        const guildPreference = new GuildPreference(GUILD_ID);
        sinon.stub(guildPreference, "updateGuildPreferences");
        sinon
            .stub(GuildPreference, "getGuildPreference")
            .returns(Promise.resolve(guildPreference));

        const session = new GameSession(
            guildPreference,
            "123",
            "1234",
            GUILD_ID,
            mockKmqMember,
            GameType.CLASSIC,
        );

        describe("KMQ playlist set", () => {
            it("should return false", async () => {
                await guildPreference.setKmqPlaylistID("id");

                assert.strictEqual(
                    await CommandPrechecks.notPlaylistPrecheck({
                        messageContext,
                        session,
                    }),
                    false,
                );
            });
        });

        describe("KMQ playlist not set", () => {
            it("should return true", async () => {
                await guildPreference.setKmqPlaylistID(null);

                assert.strictEqual(
                    await CommandPrechecks.notPlaylistPrecheck({
                        session,
                        messageContext,
                    }),
                    true,
                );
            });
        });
    });

    describe("timerHiddenPrecheck", () => {
        const GUILD_ID = "123";

        describe("hidden answer type", () => {
            const guildPreference = new GuildPreference(GUILD_ID);
            beforeEach(async () => {
                await guildPreference.setAnswerType(AnswerType.HIDDEN);
            });

            const session = new GameSession(
                guildPreference,
                "123",
                "1234",
                GUILD_ID,
                mockKmqMember,
                GameType.CLASSIC,
            );

            describe("change timer to another value", () => {
                it("should return true", async () => {
                    assert.strictEqual(
                        await CommandPrechecks.timerHiddenPrecheck({
                            session,
                            messageContext,
                            parsedMessage: {
                                components: ["5"],
                                action: "timer",
                                argument: "",
                                message: "",
                            },
                        }),
                        true,
                    );
                });
            });

            describe("disable timer", () => {
                it("should return false", async () => {
                    assert.strictEqual(
                        await CommandPrechecks.timerHiddenPrecheck({
                            session,
                            messageContext,
                            parsedMessage: {
                                components: [],
                                action: "timer",
                                argument: "",
                                message: "",
                            },
                        }),
                        false,
                    );
                });
            });

            describe("changing non-timer option", () => {
                it("should return true", async () => {
                    assert.strictEqual(
                        await CommandPrechecks.timerHiddenPrecheck({
                            session,
                            messageContext,
                            parsedMessage: {
                                components: [],
                                action: "answer",
                                argument: "",
                                message: "",
                            },
                        }),
                        true,
                    );
                });
            });
        });

        describe("non-hidden answer type", async () => {
            const guildPreference = new GuildPreference(GUILD_ID);
            await guildPreference.setAnswerType(AnswerType.MULTIPLE_CHOICE_MED);
            const session = new GameSession(
                guildPreference,
                "123",
                "1234",
                GUILD_ID,
                mockKmqMember,
                GameType.TEAMS,
            );

            describe("change timer to another value", () => {
                it("should return true", async () => {
                    assert.strictEqual(
                        await CommandPrechecks.timerHiddenPrecheck({
                            session,
                            messageContext,
                            parsedMessage: {
                                components: ["5"],
                                action: "timer",
                                argument: "",
                                message: "",
                            },
                        }),
                        true,
                    );
                });
            });

            describe("disable timer", () => {
                it("should return true", async () => {
                    assert.strictEqual(
                        await CommandPrechecks.timerHiddenPrecheck({
                            session,
                            messageContext,
                            parsedMessage: {
                                components: [],
                                action: "timer",
                                argument: "",
                                message: "",
                            },
                        }),
                        true,
                    );
                });
            });

            describe("changing non-timer option", () => {
                it("should return true", async () => {
                    assert.strictEqual(
                        await CommandPrechecks.timerHiddenPrecheck({
                            session,
                            messageContext,
                            parsedMessage: {
                                components: [],
                                action: "answer",
                                argument: "",
                                message: "",
                            },
                        }),
                        true,
                    );
                });
            });
        });
    });

    describe("notSuddenDeathPrecheck", () => {
        describe("listening session", () => {
            it("should return true", async () => {
                assert.strictEqual(
                    await CommandPrechecks.notSuddenDeathPrecheck({
                        session: new ListeningSession(
                            new GuildPreference("12"),
                            "123",
                            "1234",
                            "12345",
                            mockKmqMember,
                        ),
                        messageContext,
                    }),
                    true,
                );
            });
        });

        describe("non-sudden death game session", () => {
            it("should return true", async () => {
                assert.strictEqual(
                    await CommandPrechecks.notSuddenDeathPrecheck({
                        session: new GameSession(
                            new GuildPreference("12"),
                            "123",
                            "1234",
                            "12345",
                            mockKmqMember,
                            GameType.CLASSIC,
                        ),
                        messageContext,
                    }),
                    true,
                );
            });
        });

        describe("sudden death game session", () => {
            it("should return false", async () => {
                assert.strictEqual(
                    await CommandPrechecks.notSuddenDeathPrecheck({
                        session: new GameSession(
                            new GuildPreference("12"),
                            "123",
                            "1234",
                            "12345",
                            mockKmqMember,
                            GameType.SUDDEN_DEATH,
                        ),
                        messageContext,
                    }),
                    false,
                );
            });
        });
    });
});
