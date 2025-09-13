import EliminationPlayer from "../../../structures/elimination_player.js";
import assert from "assert";

describe("elimination player", () => {
    let player: EliminationPlayer;

    describe("decrement lives", () => {
        describe("player has a non-zero number of lives", () => {
            it("should decrement their lives by 1", () => {
                player = new EliminationPlayer(
                    "12345",
                    "guildID",
                    "someurl",
                    5,
                    "ohmi",
                );
                player.decrementLives();
                assert.strictEqual(player.getLives(), 4);
            });
        });

        describe("player has zero lives", () => {
            it("should not change their number of lives", () => {
                player = new EliminationPlayer(
                    "12345",
                    "guildID",
                    "someurl",
                    0,
                    "ohmi",
                );
                player.decrementLives();
                assert.strictEqual(player.getLives(), 0);
            });
        });
    });

    describe("eliminated", () => {
        describe("the player has non-zero lives", () => {
            it("should return false", () => {
                player = new EliminationPlayer(
                    "12345",
                    "guildID",
                    "someurl",
                    5,
                    "ohmi",
                );
                assert.strictEqual(player.isEliminated(), false);
            });
        });

        describe("the player has zero lives", () => {
            it("should return true", () => {
                player = new EliminationPlayer(
                    "12345",
                    "guildID",
                    "someurl",
                    0,
                    "ohmi",
                );
                assert.strictEqual(player.isEliminated(), true);
            });
        });
    });
});
