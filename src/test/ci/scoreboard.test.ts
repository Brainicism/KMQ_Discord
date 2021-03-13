import assert from "assert";
import GuildPreference from "../../structures/guild_preference";
import Scoreboard from "../../structures/scoreboard";

/* eslint-disable prefer-arrow-callback */
let scoreboard: Scoreboard;
beforeEach(function () {
    scoreboard = new Scoreboard("123");
});
describe("score/xp updating", function () {
    describe("single player scoreboard", function () {
        const userId = "12345";
        describe("user guesses correctly multiple times", function () {
            it("should increment the user's score/xp", function () {
                for (let i = 0; i < 20; i++) {
                    scoreboard.updateScoreboard("wonyoung#4785", userId, "someurl", 1, 50);
                    assert.strictEqual(scoreboard.getPlayerScore(userId), i + 1);
                    assert.strictEqual(scoreboard.getPlayerExpGain(userId), 50 * (i + 1));
                }
            });
        });
        describe("user has not guessed yet", function () {
            it("should not increment the user's score/xp", function () {
                assert.strictEqual(scoreboard.getPlayerScore(userId), 0);
                assert.strictEqual(scoreboard.getPlayerExpGain(userId), 0);
            });
        });
    });

    describe("multi player scoreboard", function () {
        const userIds = ["12345", "23456"];
        describe("both users guess correctly multiple times", function () {
            it("should increment each user's score", function () {
                for (let i = 0; i < 20; i++) {
                    scoreboard.updateScoreboard("wonyoung#4785", userIds[0], "someurl", 1, 50);
                    if (i % 2 === 0) {
                        scoreboard.updateScoreboard("yena#1234", userIds[1], "someurl", 1, 50);
                    }
                }
                assert.strictEqual(scoreboard.getPlayerScore(userIds[0]), 20);
                assert.strictEqual(scoreboard.getPlayerExpGain(userIds[0]), 1000);
                assert.strictEqual(scoreboard.getPlayerScore(userIds[1]), 10);
                assert.strictEqual(scoreboard.getPlayerExpGain(userIds[1]), 500);
            });
        });
        describe("both users have not guessed yet", function () {
            it("should not increment each user's score", function () {
                assert.strictEqual(scoreboard.getPlayerScore(userIds[0]), 0);
                assert.strictEqual(scoreboard.getPlayerExpGain(userIds[0]), 0);
                assert.strictEqual(scoreboard.getPlayerScore(userIds[1]), 0);
                assert.strictEqual(scoreboard.getPlayerExpGain(userIds[1]), 0);
            });
        });
    });
});

describe("winner detection", function () {
    describe("nobody has a score yet", function () {
        it("should return an empty array", function () {
            assert.deepStrictEqual(scoreboard.getWinners(), []);
        });
    });
    describe("single player, has score", function () {
        const userId = "12345";
        it("should return the single player", function () {
            scoreboard.updateScoreboard("minju#7489", userId, "someurl", 10, 0);
            assert.strictEqual(scoreboard.getWinners().length, 1);
            assert.strictEqual(scoreboard.getWinners()[0].getId(), userId);
        });
    });

    describe("multiple players, has different scores", function () {
        const userIds = ["12345", "23456"];
        it("should return the player with most points", function () {
            scoreboard.updateScoreboard("minju#7489", userIds[0], "someurl", 10, 0);
            scoreboard.updateScoreboard("sakura#5478", userIds[1], "someurl", 15, 0);
            assert.strictEqual(scoreboard.getWinners().length, 1);
            assert.strictEqual(scoreboard.getWinners()[0].getId(), userIds[1]);
        });
    });

    describe("multiple players, tied score", function () {
        const userIds = ["12345", "23456", "34567"];
        it("should return the two tied players", function () {
            scoreboard.updateScoreboard("minju#7489", userIds[0], "someurl", 5, 0);
            scoreboard.updateScoreboard("sakura#5478", userIds[1], "someurl", 7, 0);
            scoreboard.updateScoreboard("yuri#4444", userIds[2], "someurl", 7, 0);
            assert.strictEqual(scoreboard.getWinners().length, 2);
            assert.deepStrictEqual(scoreboard.getWinners().map((x) => x.getId()), [userIds[1], userIds[2]]);
        });
    });
});

describe("game finished", function () {
    beforeEach(function () {
        this.guildPreference = new GuildPreference("1234");
        this.guildPreference.setGoal(5);
    });

    describe("goal is not set", function () {
        it("should return false", function () {
            this.guildPreference.resetGoal();
            assert.strictEqual(scoreboard.gameFinished(this.guildPreference), false);
        });
    });

    describe("goal is set", function () {
        const userIds = ["12345", "23456", "34567"];
        describe("no one has a score yet", function () {
            it("should return false", function () {
                assert.strictEqual(scoreboard.gameFinished(this.guildPreference), false);
            });
        });
        describe("first place is not equal/above the goal", function () {
            it("should return false", function () {
                scoreboard.updateScoreboard("sakura#5478", userIds[0], "someurl", 2, 0);
                scoreboard.updateScoreboard("eunbi#4741", userIds[1], "someurl", 4, 0);
                assert.strictEqual(scoreboard.gameFinished(this.guildPreference), false);
            });
        });
        describe("first place is equal/above the goal", function () {
            it("should return true", function () {
                scoreboard.updateScoreboard("sakura#5478", userIds[0], "someurl", 5, 0);
                scoreboard.updateScoreboard("eunbi#4741", userIds[1], "someurl", 4, 0);
                assert.strictEqual(scoreboard.gameFinished(this.guildPreference), true);
            });
        });
    });
});
