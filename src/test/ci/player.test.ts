import assert from "assert";
import {
    ExpBonusModifier,
    ExpBonusModifierValues,
} from "../../commands/game_commands/exp";
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

    describe("player's prefix should change based on new ranking", () => {
        const previousRanking = ["12345", "jisoo", "ohmi"];
        const newRanking = ["ohmi", "jisoo", "12345"];

        describe("player moved ahead in ranking", () => {
            it("should show the player has gained ranking", () => {
                const winningPlayer = Player.fromUserID("ohmi");
                assert.strictEqual(
                    winningPlayer.getRankingPrefix(
                        newRanking,
                        previousRanking,
                        true
                    ),
                    "⬆️"
                );
            });
        });

        describe("player was passed in ranking", () => {
            it("should show the player has lost ranking", () => {
                const losingPlayer = Player.fromUserID("12345");
                assert.strictEqual(
                    losingPlayer.getRankingPrefix(
                        newRanking,
                        previousRanking,
                        true
                    ),
                    "⬇️"
                );
            });
        });

        describe("player didn't change position in ranking", () => {
            it("should not show any ranking change", () => {
                const samePlayer = Player.fromUserID("jisoo");
                assert.strictEqual(
                    samePlayer.getRankingPrefix(
                        newRanking,
                        previousRanking,
                        true
                    ),
                    "2."
                );
            });
        });

        describe("the game has ended", () => {
            it("should not show any ranking change, even if there was one", () => {
                const winningPlayer = Player.fromUserID("ohmi");
                assert.strictEqual(
                    winningPlayer.getRankingPrefix(
                        newRanking,
                        previousRanking,
                        false
                    ),
                    "1."
                );
            });
        });
    });
});

describe("increment EXP", () => {
    describe("not first game of the day", () => {
        describe("player's EXP is incremented multiple times", () => {
            it("should increment their exp", () => {
                const numIncrements = 25;
                for (let i = 0; i < numIncrements; i++) {
                    player.incrementExp(10);
                }

                assert.strictEqual(player.getExpGain(), numIncrements * 10);
            });
        });
    });

    describe("first game of the day", () => {
        beforeEach(() => {
            player = new Player("miyeon#7489", "12345", "someurl", 0, true);
        });

        describe("player's exp is incremented multiple times", () => {
            it("should increment their exp with first game bonus modifier", () => {
                const numIncrements = 25;
                for (let i = 0; i < numIncrements; i++) {
                    player.incrementExp(10);
                }

                assert.strictEqual(
                    player.getExpGain(),
                    ExpBonusModifierValues[ExpBonusModifier.FIRST_GAME_OF_DAY] *
                        numIncrements *
                        10
                );
            });
        });
    });
});
