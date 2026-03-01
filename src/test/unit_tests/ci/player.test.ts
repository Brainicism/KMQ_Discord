import { ExpBonusModifierValues } from "../../../constants.js";
import ExpBonusModifier from "../../../enums/exp_bonus_modifier.js";
import Player from "../../../structures/player.js";
import assert from "assert";

describe("player", () => {
    let player: Player;
    beforeEach(() => {
        player = new Player("12345", "guildID", "someurl", 0, "ohmi");
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
                player = new Player(
                    "12345",
                    "guildID",
                    "someurl",
                    0,
                    "ohmi",
                    true,
                );
            });

            describe("player's exp is incremented multiple times", () => {
                it("should increment their exp with first game bonus modifier", () => {
                    const numIncrements = 25;
                    for (let i = 0; i < numIncrements; i++) {
                        player.incrementExp(10);
                    }

                    assert.strictEqual(
                        player.getExpGain(),
                        ExpBonusModifierValues[
                            ExpBonusModifier.FIRST_GAME_OF_DAY
                        ] *
                            numIncrements *
                            10,
                    );
                });
            });
        });
    });
});
