import assert from "assert";
import EliminationPlayer from "../../structures/elimination_player";

let player: EliminationPlayer;
describe("decrement lives", () => {
    describe("player has a non-zero number of lives", () => {
        it("should decrement their lives by 1", () => {
            player = new EliminationPlayer("miyeon#7489", "12345", "someurl", 5);
            player.decrementLives();
            assert.strictEqual(player.getLives(), 4);
        });
    });

    describe("player has zero lives", () => {
        it("should not change their number of lives", () => {
            player = new EliminationPlayer("miyeon#7489", "12345", "someurl", 0);
            player.decrementLives();
            assert.strictEqual(player.getLives(), 0);
        });
    });
});

describe("eliminated", () => {
    describe("the player has non-zero lives", () => {
        it("should return false", () => {
            player = new EliminationPlayer("miyeon#7489", "12345", "someurl", 5);
            assert.strictEqual(player.isEliminated(), false);
        });
    });

    describe("the player has zero lives", () => {
        it("should return true", () => {
            player = new EliminationPlayer("miyeon#7489", "12345", "someurl", 0);
            assert.strictEqual(player.isEliminated(), true);
        });
    });
});
