/* eslint-disable prefer-arrow-callback */
import assert from "assert";
import EliminationPlayer from "../structures/elimination_player";

describe("decrement lives", function () {
    describe("player has a non-zero number of lives", function () {
        it("should decrement their lives by 1", function () {
            this.player = new EliminationPlayer("miyeon#7489", "12345", "someurl", 0, 5);
            this.player.decrementLives();
            assert.strictEqual(this.player.getLives(), 4);
        });
    });

    describe("player has zero lives", function () {
        it("should not change their number of lives", function () {
            this.player = new EliminationPlayer("miyeon#7489", "12345", "someurl", 0, 0);
            this.player.decrementLives();
            assert.strictEqual(this.player.getLives(), 0);
        });
    });
});

describe("eliminated", function () {
    describe("the player has non-zero lives", function () {
        it("should return false", function () {
            this.player = new EliminationPlayer("miyeon#7489", "12345", "someurl", 0, 5);
            assert.strictEqual(this.player.isEliminated(), false);
        });
    });
    describe("the player has zero lives", function () {
        it("should return true", function () {
            this.player = new EliminationPlayer("miyeon#7489", "12345", "someurl", 0, 0);
            assert.strictEqual(this.player.isEliminated(), true);
        });
    });
});
