/* eslint-disable prefer-arrow-callback */
import assert from "assert";
import Player from "../../structures/player";

let player: Player;
beforeEach(function () {
    player = new Player("miyeon#7489", "12345", "someurl", 0);
});

describe("increment score", function () {
    describe("player's score is incremented multiple times", function () {
        it("should increment their score", function () {
            const numIncrements = 25;
            for (let i = 0; i < numIncrements; i++) {
                player.incrementScore(1);
            }
            assert.strictEqual(player.getScore(), numIncrements);
        });
    });
});

describe("increment xp", function () {
    describe("player's xp is incremented multiple times", function () {
        it("should increment their xp", function () {
            const numIncrements = 25;
            for (let i = 0; i < numIncrements; i++) {
                player.incrementExp(10);
            }
            assert.strictEqual(player.getExpGain(), numIncrements * 10);
        });
    });
});
