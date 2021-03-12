import assert from "assert";
import EliminationScoreboard from "../structures/elimination_scoreboard";

/* eslint-disable prefer-arrow-callback */
const userIds = ["12345", "23456", "34567"];
const DEFAULT_LIVES = 10;

let scoreboard: EliminationScoreboard;
beforeEach(function () {
    scoreboard = new EliminationScoreboard(DEFAULT_LIVES, "123");
});

describe("score/xp updating", function () {
    beforeEach(function () {
        scoreboard.addPlayer(userIds[0], "irene#1234", "someurl");
        scoreboard.addPlayer(userIds[1], "seulgi#7854", "someurl");
        scoreboard.addPlayer(userIds[2], "joy#4144", "someurl");
    });
    describe("single player scoreboard", function () {
        describe("user guesses correctly multiple times", function () {
            it("should not affect their lives", function () {
                scoreboard.addPlayer(userIds[0], "yeonwoo#4747", "someurl");
                for (let i = 0; i < 20; i++) {
                    scoreboard.updateScoreboard("yeonwoo#4785", userIds[0], "someurl", 1, 0);
                    assert.strictEqual(scoreboard.getPlayerLives(userIds[0]), 10);
                }
            });
        });
    });

    describe("multi player scoreboard", function () {
        describe("one person guesses correctly multiple times", function () {
            it("should decrement every other user's scores", function () {
                for (let i = 0; i < 5; i++) {
                    scoreboard.updateScoreboard("irene#1234", userIds[0], "someurl", 1, 50);
                }
                assert.strictEqual(scoreboard.getPlayerLives(userIds[0]), DEFAULT_LIVES);
                assert.strictEqual(scoreboard.getPlayerLives(userIds[1]), DEFAULT_LIVES - 5);
                assert.strictEqual(scoreboard.getPlayerLives(userIds[2]), DEFAULT_LIVES - 5);
            });
        });

        describe("each player guesses correctly a different amount of times", function () {
            it("should decrease each player's score by the amount of guesses of every other player", function () {
                scoreboard.updateScoreboard("irene#1234", userIds[0], "someurl", 1, 50);
                scoreboard.updateScoreboard("irene#1234", userIds[0], "someurl", 1, 50);
                scoreboard.updateScoreboard("seulgi#7854", userIds[1], "someurl", 1, 50);
                scoreboard.updateScoreboard("seulgi#7854", userIds[1], "someurl", 1, 50);
                scoreboard.updateScoreboard("seulgi#7854", userIds[1], "someurl", 1, 50);
                scoreboard.updateScoreboard("joy#4144", userIds[2], "someurl", 1, 50);
                assert.strictEqual(scoreboard.getPlayerLives(userIds[0]), DEFAULT_LIVES - 4);
                assert.strictEqual(scoreboard.getPlayerLives(userIds[1]), DEFAULT_LIVES - 3);
                assert.strictEqual(scoreboard.getPlayerLives(userIds[2]), DEFAULT_LIVES - 5);
            });
        });
    });
});

describe("winner detection", function () {
    beforeEach(function () {
        scoreboard.addPlayer(userIds[0], "irene#1234", "someurl");
        scoreboard.addPlayer(userIds[1], "seulgi#7854", "someurl");
        scoreboard.addPlayer(userIds[2], "joy#4144", "someurl");
    });
    describe("nobody has a score yet", function () {
        it("should return an empty array", function () {
            assert.deepStrictEqual(scoreboard.getWinners(), []);
        });
    });

    describe("single player, has guessed at least once", function () {
        const userId = "12345";
        it("should return the single player", function () {
            scoreboard.updateScoreboard("minju#7489", userId, "someurl", 10, 0);
            assert.strictEqual(scoreboard.getWinners().length, 1);
            assert.strictEqual(scoreboard.getWinners()[0].getId(), userId);
        });
    });

    describe("multiple players, has different number of lives", function () {
        it("should return the player with most number of lives", function () {
            scoreboard.updateScoreboard("minju#7489", userIds[0], "someurl", 1, 0);
            scoreboard.updateScoreboard("minju#7489", userIds[0], "someurl", 1, 0);
            scoreboard.updateScoreboard("sakura#5478", userIds[1], "someurl", 1, 0);
            assert.strictEqual(scoreboard.getWinners().length, 1);
            assert.strictEqual(scoreboard.getWinners()[0].getId(), userIds[0]);
        });
    });

    describe("multiple players, tied score", function () {
        it("should return the two tied players", function () {
            scoreboard.updateScoreboard("minju#7489", userIds[0], "someurl", 1, 0);
            scoreboard.updateScoreboard("sakura#5478", userIds[1], "someurl", 1, 0);
            scoreboard.updateScoreboard("sakura#5478", userIds[1], "someurl", 1, 0);
            scoreboard.updateScoreboard("yuri#4444", userIds[2], "someurl", 1, 0);
            scoreboard.updateScoreboard("yuri#4444", userIds[2], "someurl", 1, 0);
            assert.strictEqual(scoreboard.getWinners().length, 2);
            assert.deepStrictEqual(scoreboard.getWinners().map((x) => x.getId()), [userIds[1], userIds[2]]);
        });
    });
});

describe("game finished", function () {
    describe("every player is dead", function () {
        it("should return true", function () {
            scoreboard.addPlayer(userIds[0], "irene#1234", "someurl", 0);
            scoreboard.addPlayer(userIds[1], "seulgi#7854", "someurl", 0);
            scoreboard.addPlayer(userIds[2], "joy#4144", "someurl", 0);
            assert.strictEqual(scoreboard.gameFinished(), true);
        });
    });

    describe("one player is left in a multiplayer game", function () {
        it("should return true", function () {
            scoreboard.addPlayer(userIds[0], "irene#1234", "someurl", 0);
            scoreboard.addPlayer(userIds[1], "seulgi#7854", "someurl", 0);
            scoreboard.addPlayer(userIds[2], "joy#4144", "someurl", 5);
            assert.strictEqual(scoreboard.gameFinished(), true);
        });
    });

    describe("one player is left in a single player game", function () {
        it("should return false", function () {
            scoreboard.addPlayer(userIds[0], "irene#1234", "someurl", 5);
            assert.strictEqual(scoreboard.gameFinished(), false);
        });
    });

    describe("multiple players are still alive", function () {
        it("should return false", function () {
            scoreboard.addPlayer(userIds[0], "irene#1234", "someurl", 5);
            scoreboard.addPlayer(userIds[1], "seulgi#7854", "someurl", 8);
            scoreboard.addPlayer(userIds[2], "joy#4144", "someurl", 2);
            assert.strictEqual(scoreboard.gameFinished(), false);
        });
    });
});

describe("getLivesOfWeakestPlayer", function () {
    describe("one person is the weakest", function () {
        it("should return the weakest person's number of lives", function () {
            scoreboard.addPlayer(userIds[0], "irene#1234", "someurl", 5);
            scoreboard.addPlayer(userIds[1], "seulgi#7854", "someurl", 8);
            scoreboard.addPlayer(userIds[2], "joy#4144", "someurl", 2);
            assert.strictEqual(scoreboard.getLivesOfWeakestPlayer(), 2);
        });
    });
    describe("tie for the weakest", function () {
        it("should return the number of lives", function () {
            scoreboard.addPlayer(userIds[0], "irene#1234", "someurl", 3);
            scoreboard.addPlayer(userIds[1], "seulgi#7854", "someurl", 2);
            scoreboard.addPlayer(userIds[2], "joy#4144", "someurl", 2);
            assert.strictEqual(scoreboard.getLivesOfWeakestPlayer(), 2);
        });
    });
});

describe("starting lives", function () {
    describe("no explicit number of lives set for player", function () {
        it("should default to the scoreboard's default", function () {
            scoreboard.addPlayer(userIds[0], "irene#1234", "someurl");
            assert.strictEqual(scoreboard.getPlayerLives(userIds[0]), DEFAULT_LIVES);
        });
    });
    describe("explicit number of lives set for player", function () {
        it("should use the explicitly set number of lives", function () {
            scoreboard.addPlayer(userIds[0], "irene#1234", "someurl", 17);
            assert.strictEqual(scoreboard.getPlayerLives(userIds[0]), 17);
        });
    });
});
