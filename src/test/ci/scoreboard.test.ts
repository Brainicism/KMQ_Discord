import GameOption from "../../enums/game_option_name";
import GuildPreference from "../../structures/guild_preference";
import Player from "../../structures/player";
import Scoreboard from "../../structures/scoreboard";
import assert from "assert";

const userIDs = ["12345", "23456", "34567"];
const guildID = "guild_id";
const avatarURL = "avatar_url";
describe("scoreboard", () => {
    let scoreboard: Scoreboard;
    beforeEach(() => {
        const voiceChannelID = "12345";
        scoreboard = new Scoreboard(voiceChannelID);
        userIDs.map((x) =>
            scoreboard.addPlayer(new Player(x, guildID, avatarURL, 0, x)),
        );
    });

    let guildPreference: GuildPreference;

    describe("score/exp updating", () => {
        describe("single player scoreboard", () => {
            describe("user guesses correctly multiple times", () => {
                it("should increment the user's score/EXP", () => {
                    for (let i = 0; i < 20; i++) {
                        scoreboard.update([
                            {
                                userID: userIDs[0],
                                pointsEarned: 1,
                                expGain: 50,
                            },
                        ]);

                        assert.strictEqual(
                            scoreboard.getPlayerScore(userIDs[0]),
                            i + 1,
                        );

                        assert.strictEqual(
                            scoreboard.getPlayerExpGain(userIDs[0]),
                            50 * (i + 1),
                        );
                    }
                });
            });

            describe("user has not guessed yet", () => {
                it("should not increment the user's score/EXP", () => {
                    assert.strictEqual(
                        scoreboard.getPlayerScore(userIDs[0]),
                        0,
                    );

                    assert.strictEqual(
                        scoreboard.getPlayerExpGain(userIDs[0]),
                        0,
                    );
                });
            });
        });

        describe("multi player scoreboard", () => {
            describe("both users guess correctly multiple times", () => {
                it("should increment each user's score", () => {
                    for (let i = 0; i < 20; i++) {
                        scoreboard.update([
                            {
                                userID: userIDs[0],
                                pointsEarned: 1,
                                expGain: 50,
                            },
                        ]);
                        if (i % 2 === 0) {
                            scoreboard.update([
                                {
                                    userID: userIDs[1],
                                    pointsEarned: 1,
                                    expGain: 50,
                                },
                            ]);
                        }
                    }

                    assert.strictEqual(
                        scoreboard.getPlayerScore(userIDs[0]),
                        20,
                    );

                    assert.strictEqual(
                        scoreboard.getPlayerExpGain(userIDs[0]),
                        1000,
                    );

                    assert.strictEqual(
                        scoreboard.getPlayerScore(userIDs[1]),
                        10,
                    );

                    assert.strictEqual(
                        scoreboard.getPlayerExpGain(userIDs[1]),
                        500,
                    );
                });
            });

            describe("both users have not guessed yet", () => {
                it("should not increment each user's score", () => {
                    assert.strictEqual(
                        scoreboard.getPlayerScore(userIDs[0]),
                        0,
                    );

                    assert.strictEqual(
                        scoreboard.getPlayerExpGain(userIDs[0]),
                        0,
                    );

                    assert.strictEqual(
                        scoreboard.getPlayerScore(userIDs[1]),
                        0,
                    );

                    assert.strictEqual(
                        scoreboard.getPlayerExpGain(userIDs[1]),
                        0,
                    );
                });
            });
        });

        describe("multiguess", () => {
            it("should increment the score and EXP of every player", () => {
                scoreboard.update([
                    { userID: userIDs[0], pointsEarned: 1, expGain: 50 },
                    { userID: userIDs[1], pointsEarned: 1, expGain: 25 },
                ]);
                assert.strictEqual(scoreboard.getPlayerScore(userIDs[0]), 1);
                assert.strictEqual(scoreboard.getPlayerScore(userIDs[1]), 1);
                assert.strictEqual(scoreboard.getPlayerExpGain(userIDs[0]), 50);
                assert.strictEqual(scoreboard.getPlayerExpGain(userIDs[1]), 25);
            });
        });

        describe("position changes", () => {
            it("should return the correct ranking of every player", () => {
                const players: { [user: string]: Player } = {
                    ohmiID: new Player("ohmiID", "guildID", "", 2, "ohmi"),
                    12345: new Player("12345", "guildID", "", 2, "cool"),
                    jisooID: new Player("jisooID", "guildID", "", 3, "jisoo"),
                };

                const voiceChannelID = "12345";
                const sb = new Scoreboard(voiceChannelID);
                Object.values(players).map((x) => sb.addPlayer(x));

                assert.deepStrictEqual(sb.getScoreToRankingMap(), {
                    [players["jisooID"].getScore()]: 0,

                    // Matching score entries coalesce into one
                    [players["12345"].getScore()]: 1,
                    [players["ohmiID"].getScore()]: 1,
                });

                const newPlayer = new Player("1234", "guildID", "", 1, "new");
                sb.addPlayer(newPlayer);
                players["1234"] = newPlayer;

                assert.deepStrictEqual(sb.getScoreToRankingMap(), {
                    [players["jisooID"].getScore()]: 0,
                    [players["12345"].getScore()]: 1,
                    [players["ohmiID"].getScore()]: 1,
                    [players["1234"].getScore()]: 2,
                });
            });

            it("should return the same ranking when all players have the same score", () => {
                const players = {
                    ohmiID: new Player("ohmiID", "guildID", "", 2, "ohmi"),
                    12345: new Player("12345", "guildID", "", 2, "cool"),
                    jisooID: new Player("jisooID", "guildID", "", 2, "jisoo"),
                };

                const voiceChannelID = "12345";
                const sb = new Scoreboard(voiceChannelID);
                Object.values(players).map((x) => sb.addPlayer(x));

                assert.deepStrictEqual(sb.getScoreToRankingMap(), {
                    2: 0,
                });
            });

            it("should return different rankings when all players have different scores", () => {
                const players = {
                    ohmiID: new Player("ohmiID", "guildID", "", 1, "ohmi"),
                    12345: new Player("12345", "guildID", "", 2, "cool"),
                    jisooID: new Player("jisooID", "guildID", "", 3, "jisoo"),
                };

                const voiceChannelID = "12345";
                const sb = new Scoreboard(voiceChannelID);
                Object.values(players).map((x) => sb.addPlayer(x));

                assert.deepStrictEqual(sb.getScoreToRankingMap(), {
                    [players["jisooID"].getScore()]: 0,
                    [players["12345"].getScore()]: 1,
                    [players["ohmiID"].getScore()]: 2,
                });
            });
        });

        describe("player's prefix should change based on new ranking", () => {
            const previousRanking = ["12345", "jisooID", "ohmiID"];
            const newRanking = ["ohmiID", "jisooID", "12345"];

            describe("player moved ahead in ranking", () => {
                it("should show the player has gained ranking", () => {
                    const winningPlayer = new Player(
                        "ohmiID",
                        "guildID",
                        avatarURL,
                        0,
                        "ohmi",
                    );

                    winningPlayer.setPreviousRanking(
                        previousRanking.indexOf("ohmiID"),
                    );

                    assert.strictEqual(
                        winningPlayer.getRankingPrefix(
                            newRanking.indexOf("ohmiID"),
                            true,
                        ),
                        "↑ 1.",
                    );
                });
            });

            describe("player was passed in ranking", () => {
                it("should show the player has lost ranking", () => {
                    const losingPlayer = new Player(
                        "12345",
                        "guildID",
                        avatarURL,
                        0,
                        "cool",
                    );

                    losingPlayer.setPreviousRanking(
                        previousRanking.indexOf("12345"),
                    );

                    assert.strictEqual(
                        losingPlayer.getRankingPrefix(
                            newRanking.indexOf("12345"),
                            true,
                        ),
                        "↓ 3.",
                    );
                });
            });

            describe("player didn't change position in ranking", () => {
                it("should not show any ranking change", () => {
                    const samePlayer = new Player(
                        "jisooID",
                        "guildID",
                        avatarURL,
                        0,
                        "jisoo",
                    );

                    samePlayer.setPreviousRanking(
                        previousRanking.indexOf("jisooID"),
                    );

                    assert.strictEqual(
                        samePlayer.getRankingPrefix(
                            newRanking.indexOf("jisooID"),
                            true,
                        ),
                        "2.",
                    );
                });
            });

            describe("the game has ended", () => {
                it("should not show any ranking change, even if there was one", () => {
                    const winningPlayer = new Player(
                        "ohmiID",
                        "guildID",
                        avatarURL,
                        0,
                        "ohmi",
                    );

                    winningPlayer.setPreviousRanking(
                        previousRanking.indexOf("ohmiID"),
                    );

                    assert.strictEqual(
                        winningPlayer.getRankingPrefix(
                            newRanking.indexOf("ohmiID"),
                            false,
                        ),
                        "1.",
                    );
                });
            });
        });
    });

    describe("winner detection", () => {
        describe("nobody has a score yet", () => {
            it("should return an empty array", () => {
                assert.deepStrictEqual(scoreboard.getWinners(), []);
            });
        });

        describe("single player, has score", () => {
            const userID = "12345";
            it("should return the single player", () => {
                scoreboard.update([{ userID, pointsEarned: 10, expGain: 0 }]);
                assert.strictEqual(scoreboard.getWinners().length, 1);
                assert.strictEqual(scoreboard.getWinners()[0].id, userID);
            });
        });

        describe("multiple players, has different scores", () => {
            it("should return the player with most points", () => {
                scoreboard.update([
                    { userID: userIDs[0], pointsEarned: 10, expGain: 0 },
                ]);

                scoreboard.update([
                    { userID: userIDs[1], pointsEarned: 15, expGain: 0 },
                ]);
                assert.strictEqual(scoreboard.getWinners().length, 1);
                assert.strictEqual(scoreboard.getWinners()[0].id, userIDs[1]);
            });
        });

        describe("multiple players, tied score", () => {
            it("should return the two tied players", () => {
                scoreboard.update([
                    { userID: userIDs[0], pointsEarned: 5, expGain: 0 },
                ]);

                scoreboard.update([
                    { userID: userIDs[1], pointsEarned: 7, expGain: 0 },
                ]);

                scoreboard.update([
                    { userID: userIDs[2], pointsEarned: 7, expGain: 0 },
                ]);
                assert.strictEqual(scoreboard.getWinners().length, 2);
                assert.deepStrictEqual(
                    scoreboard.getWinners().map((x) => x.id),
                    [userIDs[1], userIDs[2]],
                );
            });
        });
    });

    describe("game finished", () => {
        beforeEach(async () => {
            guildPreference = new GuildPreference("1234");
            await guildPreference.setGoal(5);
        });

        describe("goal is not set", () => {
            it("should return false", async () => {
                await guildPreference.reset(GameOption.GOAL);
                assert.strictEqual(
                    scoreboard.gameFinished(guildPreference),
                    false,
                );
            });
        });

        describe("goal is set", () => {
            describe("no one has a score yet", () => {
                it("should return false", () => {
                    assert.strictEqual(
                        scoreboard.gameFinished(guildPreference),
                        false,
                    );
                });
            });

            describe("first place is not equal/above the goal", () => {
                it("should return false", () => {
                    scoreboard.update([
                        { userID: userIDs[0], pointsEarned: 2, expGain: 0 },
                    ]);

                    scoreboard.update([
                        { userID: userIDs[1], pointsEarned: 4, expGain: 0 },
                    ]);

                    assert.strictEqual(
                        scoreboard.gameFinished(guildPreference),
                        false,
                    );
                });
            });

            describe("first place is equal/above the goal", () => {
                it("should return true", () => {
                    scoreboard.update([
                        { userID: userIDs[0], pointsEarned: 5, expGain: 0 },
                    ]);

                    scoreboard.update([
                        { userID: userIDs[1], pointsEarned: 4, expGain: 0 },
                    ]);

                    assert.strictEqual(
                        scoreboard.gameFinished(guildPreference),
                        true,
                    );
                });
            });
        });
    });
});
