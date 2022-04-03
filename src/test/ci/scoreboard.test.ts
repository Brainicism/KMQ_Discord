import assert from "assert";

import GuildPreference from "../../structures/guild_preference";
import Player from "../../structures/player";
import Scoreboard from "../../structures/scoreboard";
import { GameOption } from "../../types";

const userIDs = ["12345", "23456", "34567"];

let scoreboard: Scoreboard;
beforeEach(() => {
    scoreboard = new Scoreboard();
    userIDs.map((x) => scoreboard.addPlayer(Player.fromUserID(x)));
});

let guildPreference: GuildPreference;

describe("score/exp updating", () => {
    describe("single player scoreboard", () => {
        describe("user guesses correctly multiple times", () => {
            it("should increment the user's score/EXP", async () => {
                for (let i = 0; i < 20; i++) {
                    await scoreboard.update([
                        { expGain: 50, pointsEarned: 1, userID: userIDs[0] },
                    ]);

                    assert.strictEqual(
                        scoreboard.getPlayerScore(userIDs[0]),
                        i + 1
                    );

                    assert.strictEqual(
                        scoreboard.getPlayerExpGain(userIDs[0]),
                        50 * (i + 1)
                    );
                }
            });
        });

        describe("user has not guessed yet", () => {
            it("should not increment the user's score/EXP", () => {
                assert.strictEqual(scoreboard.getPlayerScore(userIDs[0]), 0);
                assert.strictEqual(scoreboard.getPlayerExpGain(userIDs[0]), 0);
            });
        });
    });

    describe("multi player scoreboard", () => {
        describe("both users guess correctly multiple times", () => {
            it("should increment each user's score", async () => {
                for (let i = 0; i < 20; i++) {
                    await scoreboard.update([
                        { expGain: 50, pointsEarned: 1, userID: userIDs[0] },
                    ]);
                    if (i % 2 === 0) {
                        await scoreboard.update([
                            {
                                expGain: 50,
                                pointsEarned: 1,
                                userID: userIDs[1],
                            },
                        ]);
                    }
                }

                assert.strictEqual(scoreboard.getPlayerScore(userIDs[0]), 20);
                assert.strictEqual(
                    scoreboard.getPlayerExpGain(userIDs[0]),
                    1000
                );
                assert.strictEqual(scoreboard.getPlayerScore(userIDs[1]), 10);
                assert.strictEqual(
                    scoreboard.getPlayerExpGain(userIDs[1]),
                    500
                );
            });
        });

        describe("both users have not guessed yet", () => {
            it("should not increment each user's score", () => {
                assert.strictEqual(scoreboard.getPlayerScore(userIDs[0]), 0);
                assert.strictEqual(scoreboard.getPlayerExpGain(userIDs[0]), 0);
                assert.strictEqual(scoreboard.getPlayerScore(userIDs[1]), 0);
                assert.strictEqual(scoreboard.getPlayerExpGain(userIDs[1]), 0);
            });
        });
    });

    describe("multiguess", () => {
        it("should increment the score and EXP of every player", async () => {
            await scoreboard.update([
                { expGain: 50, pointsEarned: 1, userID: userIDs[0] },
                { expGain: 25, pointsEarned: 1, userID: userIDs[1] },
            ]);
            assert.strictEqual(scoreboard.getPlayerScore(userIDs[0]), 1);
            assert.strictEqual(scoreboard.getPlayerScore(userIDs[1]), 1);
            assert.strictEqual(scoreboard.getPlayerExpGain(userIDs[0]), 50);
            assert.strictEqual(scoreboard.getPlayerExpGain(userIDs[1]), 25);
        });
    });

    describe("position changes", () => {
        it("should return the correct ranking of every player", async () => {
            const players = {
                12345: new Player("", "12345", "", 2),
                jisooID: new Player("", "jisooID", "", 3),
                ohmiID: new Player("", "ohmiID", "", 2),
            };

            const sb = new Scoreboard();
            Object.values(players).map((x) => sb.addPlayer(x));

            assert.deepStrictEqual(sb.getScoreToRankingMap(), {
                [players["jisooID"].getScore()]: 0,

                // Matching score entries coalesce into one
                [players["12345"].getScore()]: 1,
                [players["ohmiID"].getScore()]: 1,
            });

            const newPlayer = new Player("", "1234", "", 1);
            sb.addPlayer(newPlayer);
            players["1234"] = newPlayer;

            assert.deepStrictEqual(sb.getScoreToRankingMap(), {
                [players["jisooID"].getScore()]: 0,
                [players["12345"].getScore()]: 1,
                [players["ohmiID"].getScore()]: 1,
                [players["1234"].getScore()]: 2,
            });
        });

        it("should return the same ranking when all players have the same score", async () => {
            const players = {
                12345: new Player("", "12345", "", 2),
                jisooID: new Player("", "jisooID", "", 2),
                ohmiID: new Player("", "ohmiID", "", 2),
            };

            const sb = new Scoreboard();
            Object.values(players).map((x) => sb.addPlayer(x));

            assert.deepStrictEqual(sb.getScoreToRankingMap(), {
                2: 0,
            });
        });

        it("should return different rankings when all players have different scores", async () => {
            const players = {
                12345: new Player("", "12345", "", 2),
                jisooID: new Player("", "jisooID", "", 3),
                ohmiID: new Player("", "ohmiID", "", 1),
            };

            const sb = new Scoreboard();
            Object.values(players).map((x) => sb.addPlayer(x));

            assert.deepStrictEqual(sb.getScoreToRankingMap(), {
                [players["jisooID"].getScore()]: 0,
                [players["12345"].getScore()]: 1,
                [players["ohmiID"].getScore()]: 2,
            });
        });
    });

    describe("player's prefix should change based on new ranking", () => {
        const previousRanking = ["12345", "jisoo", "ohmi"];
        const newRanking = ["ohmi", "jisoo", "12345"];

        describe("player moved ahead in ranking", () => {
            it("should show the player has gained ranking", () => {
                const winningPlayer = Player.fromUserID("ohmi");
                winningPlayer.setPreviousRanking(
                    previousRanking.indexOf("ohmi")
                );

                assert.strictEqual(
                    winningPlayer.getRankingPrefix(
                        newRanking.indexOf("ohmi"),
                        true
                    ),
                    "↑ 1."
                );
            });
        });

        describe("player was passed in ranking", () => {
            it("should show the player has lost ranking", () => {
                const losingPlayer = Player.fromUserID("12345");
                losingPlayer.setPreviousRanking(
                    previousRanking.indexOf("12345")
                );

                assert.strictEqual(
                    losingPlayer.getRankingPrefix(
                        newRanking.indexOf("12345"),
                        true
                    ),
                    "↓ 3."
                );
            });
        });

        describe("player didn't change position in ranking", () => {
            it("should not show any ranking change", () => {
                const samePlayer = Player.fromUserID("jisoo");
                samePlayer.setPreviousRanking(previousRanking.indexOf("jisoo"));
                assert.strictEqual(
                    samePlayer.getRankingPrefix(
                        newRanking.indexOf("jisoo"),
                        true
                    ),
                    "2."
                );
            });
        });

        describe("the game has ended", () => {
            it("should not show any ranking change, even if there was one", () => {
                const winningPlayer = Player.fromUserID("ohmi");
                winningPlayer.setPreviousRanking(
                    previousRanking.indexOf("ohmi")
                );

                assert.strictEqual(
                    winningPlayer.getRankingPrefix(
                        newRanking.indexOf("ohmi"),
                        false
                    ),
                    "1."
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
        it("should return the single player", async () => {
            await scoreboard.update([{ expGain: 0, pointsEarned: 10, userID }]);
            assert.strictEqual(scoreboard.getWinners().length, 1);
            assert.strictEqual(scoreboard.getWinners()[0].id, userID);
        });
    });

    describe("multiple players, has different scores", () => {
        it("should return the player with most points", async () => {
            await scoreboard.update([
                { expGain: 0, pointsEarned: 10, userID: userIDs[0] },
            ]);

            await scoreboard.update([
                { expGain: 0, pointsEarned: 15, userID: userIDs[1] },
            ]);
            assert.strictEqual(scoreboard.getWinners().length, 1);
            assert.strictEqual(scoreboard.getWinners()[0].id, userIDs[1]);
        });
    });

    describe("multiple players, tied score", () => {
        it("should return the two tied players", async () => {
            await scoreboard.update([
                { expGain: 0, pointsEarned: 5, userID: userIDs[0] },
            ]);

            await scoreboard.update([
                { expGain: 0, pointsEarned: 7, userID: userIDs[1] },
            ]);

            await scoreboard.update([
                { expGain: 0, pointsEarned: 7, userID: userIDs[2] },
            ]);
            assert.strictEqual(scoreboard.getWinners().length, 2);
            assert.deepStrictEqual(
                scoreboard.getWinners().map((x) => x.id),
                [userIDs[1], userIDs[2]]
            );
        });
    });
});

describe("game finished", () => {
    beforeEach(() => {
        guildPreference = new GuildPreference("1234");
        guildPreference.setGoal(5);
    });

    describe("goal is not set", () => {
        it("should return false", () => {
            guildPreference.reset(GameOption.GOAL);
            assert.strictEqual(scoreboard.gameFinished(guildPreference), false);
        });
    });

    describe("goal is set", () => {
        describe("no one has a score yet", () => {
            it("should return false", () => {
                assert.strictEqual(
                    scoreboard.gameFinished(guildPreference),
                    false
                );
            });
        });

        describe("first place is not equal/above the goal", () => {
            it("should return false", async () => {
                await scoreboard.update([
                    { expGain: 0, pointsEarned: 2, userID: userIDs[0] },
                ]);

                await scoreboard.update([
                    { expGain: 0, pointsEarned: 4, userID: userIDs[1] },
                ]);

                assert.strictEqual(
                    scoreboard.gameFinished(guildPreference),
                    false
                );
            });
        });

        describe("first place is equal/above the goal", () => {
            it("should return true", async () => {
                await scoreboard.update([
                    { expGain: 0, pointsEarned: 5, userID: userIDs[0] },
                ]);

                await scoreboard.update([
                    { expGain: 0, pointsEarned: 4, userID: userIDs[1] },
                ]);

                assert.strictEqual(
                    scoreboard.gameFinished(guildPreference),
                    true
                );
            });
        });
    });
});
