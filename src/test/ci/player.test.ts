import assert from "assert";
import Player from "../../structures/player";

let player: Player;
beforeEach(() => {
    player = new Player("miyeon#7489", "12345", "someurl", 0);
});

describe("increment score", () => {
    describe("player's score is incremented multiple times", () => {
        it("should increment their score", () => {
            const numIncrements = 25;
            for (let i = 0; i < numIncrements; i++) {
                player.incrementScore(1);
            }
            assert.strictEqual(player.getScore(), numIncrements);
        });
    });
});

describe("increment xp", () => {
    describe("player's exp is incremented multiple times", () => {
        it("should increment their exp", () => {
            const numIncrements = 25;
            for (let i = 0; i < numIncrements; i++) {
                player.incrementExp(10);
            }
            assert.strictEqual(player.getExpGain(), numIncrements * 10);
        });
    });
});
