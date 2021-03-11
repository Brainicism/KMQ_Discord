import assert from "assert";
import EliminationScoreboard from "../structures/elimination_scoreboard";

/* eslint-disable prefer-arrow-callback */
const userIds = ["12345", "23456", "34567"];
beforeEach(function () {
    this.eliminationScoreboard = new EliminationScoreboard(10, "123");
});

describe("score/xp updating", function () {
    beforeEach(function () {
        this.eliminationScoreboard.addPlayer(userIds[0], "irene#1234", "someurl");
        this.eliminationScoreboard.addPlayer(userIds[1], "seulgi#7854", "someurl");
        this.eliminationScoreboard.addPlayer(userIds[2], "joy#4144", "someurl");
    });
    describe("single player scoreboard", function () {
        describe("user guesses correctly multiple times", function () {
            it("should not affect their lives", function () {
                this.eliminationScoreboard.addPlayer(userIds[0], "yeonwoo#4747", "someurl");
                for (let i = 0; i < 20; i++) {
                    this.eliminationScoreboard.updateScoreboard("yeonwoo#4785", userIds[0], "someurl", 1, 0);
                    assert.strictEqual(this.eliminationScoreboard.getPlayerLives(userIds[0]), 10);
                }
            });
        });
    });

    describe("multi player scoreboard", function () {
        describe("one person guesses correctly multiple times", function () {
            it("should decrement every other user's scores", function () {
                for (let i = 0; i < 5; i++) {
                    this.eliminationScoreboard.updateScoreboard("irene#1234", userIds[0], "someurl", 1, 50);
                }
                assert.strictEqual(this.eliminationScoreboard.getPlayerLives(userIds[0]), 10);
                assert.strictEqual(this.eliminationScoreboard.getPlayerLives(userIds[1]), 5);
                assert.strictEqual(this.eliminationScoreboard.getPlayerLives(userIds[2]), 5);
            });
        });

        describe("each player guesses correctly a different amount of times", function () {
            it("should decrease each player's score by the amount of guesses of every other player", function () {
                this.eliminationScoreboard.updateScoreboard("irene#1234", userIds[0], "someurl", 1, 50);
                this.eliminationScoreboard.updateScoreboard("irene#1234", userIds[0], "someurl", 1, 50);
                this.eliminationScoreboard.updateScoreboard("seulgi#7854", userIds[1], "someurl", 1, 50);
                this.eliminationScoreboard.updateScoreboard("seulgi#7854", userIds[1], "someurl", 1, 50);
                this.eliminationScoreboard.updateScoreboard("seulgi#7854", userIds[1], "someurl", 1, 50);
                this.eliminationScoreboard.updateScoreboard("joy#4144", userIds[2], "someurl", 1, 50);
                assert.strictEqual(this.eliminationScoreboard.getPlayerLives(userIds[0]), 6);
                assert.strictEqual(this.eliminationScoreboard.getPlayerLives(userIds[1]), 7);
                assert.strictEqual(this.eliminationScoreboard.getPlayerLives(userIds[2]), 5);
            });
        });
    });
});

describe("winner detection", function () {
    beforeEach(function () {
        this.eliminationScoreboard.addPlayer(userIds[0], "irene#1234", "someurl");
        this.eliminationScoreboard.addPlayer(userIds[1], "seulgi#7854", "someurl");
        this.eliminationScoreboard.addPlayer(userIds[2], "joy#4144", "someurl");
    });
    describe("nobody has a score yet", function () {
        it("should return an empty array", function () {
            assert.deepStrictEqual(this.eliminationScoreboard.getWinners(), []);
        });
    });

    describe("single player, has guessed atleast once", function () {
        const userId = "12345";
        it("should return the single player", function () {
            this.eliminationScoreboard.updateScoreboard("minju#7489", userId, "someurl", 10, 0);
            assert.strictEqual(this.eliminationScoreboard.getWinners().length, 1);
            assert.strictEqual(this.eliminationScoreboard.getWinners()[0].id, userId);
        });
    });

    describe("multiple players, has different number of lives", function () {
        it("should return the player with most number of lives", function () {
            this.eliminationScoreboard.updateScoreboard("minju#7489", userIds[0], "someurl", 1, 0);
            this.eliminationScoreboard.updateScoreboard("minju#7489", userIds[0], "someurl", 1, 0);
            this.eliminationScoreboard.updateScoreboard("sakura#5478", userIds[1], "someurl", 1, 0);
            assert.strictEqual(this.eliminationScoreboard.getWinners().length, 1);
            assert.strictEqual(this.eliminationScoreboard.getWinners()[0].id, userIds[0]);
        });
    });

    describe("multiple players, tied score", function () {
        it("should return the two tied players", function () {
            this.eliminationScoreboard.updateScoreboard("minju#7489", userIds[0], "someurl", 1, 0);
            this.eliminationScoreboard.updateScoreboard("sakura#5478", userIds[1], "someurl", 1, 0);
            this.eliminationScoreboard.updateScoreboard("sakura#5478", userIds[1], "someurl", 1, 0);
            this.eliminationScoreboard.updateScoreboard("yuri#4444", userIds[2], "someurl", 1, 0);
            this.eliminationScoreboard.updateScoreboard("yuri#4444", userIds[2], "someurl", 1, 0);
            assert.strictEqual(this.eliminationScoreboard.getWinners().length, 2);
            assert.deepStrictEqual(this.eliminationScoreboard.getWinners().map((x) => x.id), [userIds[1], userIds[2]]);
        });
    });
});

describe("game finished", function () {
    describe("every player is dead", function () {
        it("should return true", function () {
            this.eliminationScoreboard.addPlayer(userIds[0], "irene#1234", "someurl", 0);
            this.eliminationScoreboard.addPlayer(userIds[1], "seulgi#7854", "someurl", 0);
            this.eliminationScoreboard.addPlayer(userIds[2], "joy#4144", "someurl", 0);
            assert.strictEqual(this.eliminationScoreboard.gameFinished(), true);
        });
    });

    describe("one player is left in a multiplayer game", function () {
        it("should return true", function () {
            this.eliminationScoreboard.addPlayer(userIds[0], "irene#1234", "someurl", 0);
            this.eliminationScoreboard.addPlayer(userIds[1], "seulgi#7854", "someurl", 0);
            this.eliminationScoreboard.addPlayer(userIds[2], "joy#4144", "someurl", 5);
            assert.strictEqual(this.eliminationScoreboard.gameFinished(), true);
        });
    });

    describe("one player is left in a single player game", function () {
        it("should return false", function () {
            this.eliminationScoreboard.addPlayer(userIds[0], "irene#1234", "someurl", 5);
            assert.strictEqual(this.eliminationScoreboard.gameFinished(), false);
        });
    });

    describe("multiple players are still alive", function () {
        it("should return false", function () {
            this.eliminationScoreboard.addPlayer(userIds[0], "irene#1234", "someurl", 5);
            this.eliminationScoreboard.addPlayer(userIds[1], "seulgi#7854", "someurl", 8);
            this.eliminationScoreboard.addPlayer(userIds[2], "joy#4144", "someurl", 2);
            assert.strictEqual(this.eliminationScoreboard.gameFinished(), false);
        });
    });
});

describe("getLivesOfWeakestPlayer", function () {
    describe("one person is the weakest", function () {
        it("should return the weakest person's number of lives", function () {
            this.eliminationScoreboard.addPlayer(userIds[0], "irene#1234", "someurl", 5);
            this.eliminationScoreboard.addPlayer(userIds[1], "seulgi#7854", "someurl", 8);
            this.eliminationScoreboard.addPlayer(userIds[2], "joy#4144", "someurl", 2);
            assert.strictEqual(this.eliminationScoreboard.getLivesOfWeakestPlayer(), 2);
        });
    });
    describe("tie for the weakest", function () {
        it("should return the number of lives", function () {
            this.eliminationScoreboard.addPlayer(userIds[0], "irene#1234", "someurl", 2);
            this.eliminationScoreboard.addPlayer(userIds[1], "seulgi#7854", "someurl", 2);
            this.eliminationScoreboard.addPlayer(userIds[2], "joy#4144", "someurl", 2);
            assert.strictEqual(this.eliminationScoreboard.getLivesOfWeakestPlayer(), 2);
        });
    });
});

describe("starting lives", function () {
    describe("no explicit number of lives set for player", function () {
        it("should default to the scoreboard's default", function () {
            this.eliminationScoreboard.addPlayer(userIds[0], "irene#1234", "someurl");
            assert.strictEqual(this.eliminationScoreboard.getPlayerLives(userIds[0]), 10);
        });
    });
    describe("explicit number of lives set for player", function () {
        it("should use the explicitly set number of lives", function () {
            this.eliminationScoreboard.addPlayer(userIds[0], "irene#1234", "someurl", 17);
            assert.strictEqual(this.eliminationScoreboard.getPlayerLives(userIds[0]), 17);
        });
    });
});
