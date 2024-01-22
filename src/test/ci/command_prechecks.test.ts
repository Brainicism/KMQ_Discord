import * as discord_utils from "../../helpers/discord_utils";
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
            it("should return false", () => {
                assert.equal(
                    CommandPrechecks.inSessionCommandPrecheck({
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
                it("should return true", () => {
                    sandbox
                        .stub(discord_utils, "areUserAndBotInSameVoiceChannel")
                        .callsFake(() => true);

                    assert.equal(
                        CommandPrechecks.inSessionCommandPrecheck({
                            session: listeningSession,
                            messageContext,
                        }),
                        true,
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
                        it("should return false", () => {
                            eliminationGameSession.sessionInitialized = true;
                            teamGameSession.sessionInitialized = true;
                            assert.equal(
                                CommandPrechecks.inSessionCommandPrecheck({
                                    session: eliminationGameSession,
                                    messageContext,
                                }),
                                false,
                            );

                            assert.equal(
                                CommandPrechecks.inSessionCommandPrecheck({
                                    session: teamGameSession,
                                    messageContext,
                                }),
                                false,
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
                                }),
                                true,
                            );

                            assert.equal(
                                CommandPrechecks.inSessionCommandPrecheck({
                                    session: teamGameSession,
                                    messageContext,
                                }),
                                true,
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
            it("should return true", () => {
                assert.strictEqual(
                    CommandPrechecks.notListeningPrecheck({
                        session: mockGameSession,
                        messageContext,
                    }),
                    true,
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
                    false,
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
                    true,
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

            it("should return false", () => {
                assert.strictEqual(
                    CommandPrechecks.maintenancePrecheck({
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

            it("should return true", () => {
                assert.strictEqual(
                    CommandPrechecks.maintenancePrecheck({
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
                    true,
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

    describe("notSpotifyPrecheck", () => {
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

        describe("spotify playlist set", () => {
            it("should return false", async () => {
                await guildPreference.setSpotifyPlaylistID("id");

                assert.strictEqual(
                    await CommandPrechecks.notSpotifyPrecheck({
                        messageContext,
                        session,
                    }),
                    false,
                );
            });
        });

        describe("spotify playlist not set", () => {
            it("should return true", async () => {
                await guildPreference.setSpotifyPlaylistID(null);

                assert.strictEqual(
                    await CommandPrechecks.notSpotifyPrecheck({
                        session,
                        messageContext,
                    }),
                    true,
                );
            });
        });
    });

    describe("answerHiddenPrecheck", () => {
        const GUILD_ID = "123";

        describe("hidden game session", () => {
            const session = new GameSession(
                new GuildPreference(GUILD_ID),
                "123",
                "1234",
                GUILD_ID,
                mockKmqMember,
                GameType.HIDDEN,
            );

            describe("change to multiple choice during hidden game via default reset", () => {
                it("should return false", () => {
                    assert.strictEqual(
                        CommandPrechecks.answerHiddenPrecheck({
                            session,
                            messageContext,
                            parsedMessage: {
                                components: [],
                                action: "answer",
                                argument: "",
                                message: "",
                            },
                        }),
                        false,
                    );
                });
            });

            describe("change to multiple choice during hidden game via explicit multiple choice", () => {
                it("should return false", () => {
                    assert.strictEqual(
                        CommandPrechecks.answerHiddenPrecheck({
                            session,
                            messageContext,
                            parsedMessage: {
                                components: ["easy"],
                                action: "answer",
                                argument: "",
                                message: "",
                            },
                        }),
                        false,
                    );
                });
            });

            describe("change to typing typos", () => {
                it("should return true", () => {
                    assert.strictEqual(
                        CommandPrechecks.answerHiddenPrecheck({
                            session,
                            messageContext,
                            parsedMessage: {
                                components: ["typingtypos"],
                                action: "answer",
                                argument: "",
                                message: "",
                            },
                        }),
                        true,
                    );
                });
            });

            describe("changing non-answer option", () => {
                it("should return true", () => {
                    assert.strictEqual(
                        CommandPrechecks.answerHiddenPrecheck({
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
        });

        describe("non-hidden game session", () => {
            const session = new GameSession(
                new GuildPreference(GUILD_ID),
                "123",
                "1234",
                GUILD_ID,
                mockKmqMember,
                GameType.CLASSIC,
            );

            describe("change to multiple choice via default reset", () => {
                it("should return true", () => {
                    assert.strictEqual(
                        CommandPrechecks.answerHiddenPrecheck({
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

            describe("change to multiple choice via explicit multiple choice", () => {
                it("should return true", () => {
                    assert.strictEqual(
                        CommandPrechecks.answerHiddenPrecheck({
                            session,
                            messageContext,
                            parsedMessage: {
                                components: ["easy"],
                                action: "answer",
                                argument: "",
                                message: "",
                            },
                        }),
                        true,
                    );
                });
            });

            describe("change to typing typos", () => {
                it("should return true", () => {
                    assert.strictEqual(
                        CommandPrechecks.answerHiddenPrecheck({
                            session,
                            messageContext,
                            parsedMessage: {
                                components: ["typingtypos"],
                                action: "answer",
                                argument: "",
                                message: "",
                            },
                        }),
                        true,
                    );
                });
            });

            describe("changing non-answer option", () => {
                it("should return true", () => {
                    assert.strictEqual(
                        CommandPrechecks.answerHiddenPrecheck({
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
        });
    });

    describe("timerHiddenPrecheck", () => {
        const GUILD_ID = "123";

        describe("hidden game session", () => {
            const session = new GameSession(
                new GuildPreference(GUILD_ID),
                "123",
                "1234",
                GUILD_ID,
                mockKmqMember,
                GameType.HIDDEN,
            );

            describe("change timer to another value", () => {
                it("should return true", () => {
                    assert.strictEqual(
                        CommandPrechecks.timerHiddenPrecheck({
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
                it("should return false", () => {
                    assert.strictEqual(
                        CommandPrechecks.timerHiddenPrecheck({
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
                it("should return true", () => {
                    assert.strictEqual(
                        CommandPrechecks.timerHiddenPrecheck({
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

        describe("non-hidden game session", () => {
            const session = new GameSession(
                new GuildPreference(GUILD_ID),
                "123",
                "1234",
                GUILD_ID,
                mockKmqMember,
                GameType.TEAMS,
            );

            describe("change timer to another value", () => {
                it("should return true", () => {
                    assert.strictEqual(
                        CommandPrechecks.timerHiddenPrecheck({
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
                it("should return true", () => {
                    assert.strictEqual(
                        CommandPrechecks.timerHiddenPrecheck({
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
                it("should return true", () => {
                    assert.strictEqual(
                        CommandPrechecks.timerHiddenPrecheck({
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
});
