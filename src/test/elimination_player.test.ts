/* eslint-disable prefer-arrow-callback */
import assert from "assert";
import EliminationPlayer from "../structures/elimination_player";

let player: EliminationPlayer;
describe("decrement lives", function () {
    describe("player has a non-zero number of lives", function () {
        it("should decrement their lives by 1", function () {
            player = new EliminationPlayer("miyeon#7489", "12345", "someurl", 0, 5);
            player.decrementLives();
            assert.strictEqual(player.getLives(), 4);
        });
    });

    describe("player has zero lives", function () {
        it("should not change their number of lives", function () {
            player = new EliminationPlayer("miyeon#7489", "12345", "someurl", 0, 0);
            player.decrementLives();
            assert.strictEqual(player.getLives(), 0);
        });
    });
});

describe("eliminated", function () {
    describe("the player has non-zero lives", function () {
        it("should return false", function () {
            player = new EliminationPlayer("miyeon#7489", "12345", "someurl", 0, 5);
            assert.strictEqual(player.isEliminated(), false);
        });
    });
    describe("the player has zero lives", function () {
        it("should return true", function () {
            player = new EliminationPlayer("miyeon#7489", "12345", "someurl", 0, 0);
            assert.strictEqual(player.isEliminated(), true);
        });
    });
});
