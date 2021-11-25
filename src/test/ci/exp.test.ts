import assert from "assert";
import sinon, { SinonSandbox } from "sinon";
import {
    calculateOptionsExpMultiplierInternal,
    calculateRoundExpMultiplier,
    ExpBonusModifier,
    ExpBonusModifierValues,
    participantExpScalingModifier,
} from "../../commands/game_commands/exp";
import * as exp from "../../commands/game_commands/exp";
import { AnswerType } from "../../commands/game_options/answer";
import { GuessModeType } from "../../commands/game_options/guessmode";
import * as game_utils from "../../helpers/game_utils";
import * as utils from "../../helpers/utils";
import GameRound from "../../structures/game_round";
import GuildPreference from "../../structures/guild_preference";

let guildPreference: GuildPreference;
const sandbox: SinonSandbox = sinon.createSandbox();
describe("calculateOptionsMultiplier", () => {
    beforeEach(() => {
        guildPreference = GuildPreference.fromGuild("123");
        sandbox.stub(guildPreference, "updateGuildPreferences");
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe("no time-based modifiers", () => {
        beforeEach(() => {
            // non power hour
            sandbox.stub(utils, "isPowerHour").callsFake(() => false);
            // non weekend
            sandbox.stub(utils, "isWeekend").callsFake(() => false);
        });

        describe("insufficient song count", () => {
            beforeEach(() => {
                sandbox
                    .stub(game_utils, "getAvailableSongCount")
                    .callsFake(() =>
                        Promise.resolve({ count: 1, countBeforeLimit: 200 })
                    );
            });

            it("should return insufficient song count penalty", async () => {
                const modifiers = await calculateOptionsExpMultiplierInternal(
                    guildPreference,
                    false
                );

                assert.strictEqual(modifiers.length, 1);
                assert.strictEqual(
                    modifiers[0].name,
                    ExpBonusModifier.BELOW_SONG_COUNT_THRESHOLD
                );
            });
        });

        describe("sufficient song count", () => {
            beforeEach(() => {
                // above song threshold
                sandbox
                    .stub(game_utils, "getAvailableSongCount")
                    .callsFake(() =>
                        Promise.resolve({ count: 200, countBeforeLimit: 200 })
                    );
            });

            describe("no active modifiers", () => {
                it("should return empty array", async () => {
                    const modifiers =
                        await calculateOptionsExpMultiplierInternal(
                            guildPreference,
                            false
                        );

                    assert.strictEqual(modifiers.length, 0);
                });
            });

            describe("vote bonus", () => {
                it("should return vote bonus modifier", async () => {
                    const modifiers =
                        await calculateOptionsExpMultiplierInternal(
                            guildPreference,
                            true
                        );

                    assert.strictEqual(modifiers.length, 1);
                    assert.strictEqual(
                        modifiers[0].name,
                        ExpBonusModifier.VOTE
                    );
                });
            });

            describe("multiple choice penalty", () => {
                const multipleChoicePenaltyMap = {
                    [AnswerType.MULTIPLE_CHOICE_EASY]:
                        ExpBonusModifier.MC_GUESS_EASY,
                    [AnswerType.MULTIPLE_CHOICE_MED]:
                        ExpBonusModifier.MC_GUESS_MEDIUM,
                    [AnswerType.MULTIPLE_CHOICE_HARD]:
                        ExpBonusModifier.MC_GUESS_HARD,
                };

                for (const answerType of Object.keys(
                    multipleChoicePenaltyMap
                )) {
                    // eslint-disable-next-line @typescript-eslint/no-loop-func
                    it(`should return corresponding multiple choice penalty (${answerType})`, async () => {
                        guildPreference.setAnswerType(answerType as AnswerType);
                        const modifiers =
                            await calculateOptionsExpMultiplierInternal(
                                guildPreference,
                                false
                            );

                        assert.strictEqual(modifiers.length, 1);
                        assert.strictEqual(
                            modifiers[0].name,
                            multipleChoicePenaltyMap[answerType]
                        );
                    });
                }
            });

            describe("artist/group guess mode", () => {
                describe("artist guess mode", () => {
                    it("should return artist guess penalty", async () => {
                        await guildPreference.setGuessModeType(
                            GuessModeType.ARTIST
                        );
                        const modifiers =
                            await calculateOptionsExpMultiplierInternal(
                                guildPreference,
                                false
                            );

                        assert.strictEqual(modifiers.length, 1);
                        assert.strictEqual(
                            modifiers[0].name,
                            ExpBonusModifier.ARTIST_GUESS
                        );
                    });
                });

                describe("'both' guess mode", () => {
                    it("should return artist guess penalty", async () => {
                        await guildPreference.setGuessModeType(
                            GuessModeType.BOTH
                        );
                        const modifiers =
                            await calculateOptionsExpMultiplierInternal(
                                guildPreference,
                                false
                            );

                        assert.strictEqual(modifiers.length, 1);
                        assert.strictEqual(
                            modifiers[0].name,
                            ExpBonusModifier.ARTIST_GUESS
                        );
                    });
                });

                describe("groups mode also selected", () => {
                    it("should return artist guess + groups mode penalty", async () => {
                        await guildPreference.setGuessModeType(
                            GuessModeType.BOTH
                        );

                        await guildPreference.setGroups([
                            { id: 1, name: "aespa" },
                        ]);
                        const modifiers =
                            await calculateOptionsExpMultiplierInternal(
                                guildPreference,
                                false
                            );

                        assert.strictEqual(modifiers.length, 1);
                        assert.strictEqual(
                            modifiers[0].name,
                            ExpBonusModifier.ARTIST_GUESS_GROUPS_SELECTED
                        );
                    });
                });
            });
        });
    });

    describe("powerhour", () => {
        beforeEach(() => {
            sandbox
                .stub(game_utils, "getAvailableSongCount")
                .callsFake(() =>
                    Promise.resolve({ count: 200, countBeforeLimit: 200 })
                );
        });

        describe("is weekend", () => {
            it("should return power hour modifier", async () => {
                sandbox.stub(utils, "isWeekend").callsFake(() => true);
                const modifiers = await calculateOptionsExpMultiplierInternal(
                    guildPreference,
                    false
                );

                assert.strictEqual(modifiers.length, 1);
                assert.strictEqual(
                    modifiers[0].name,
                    ExpBonusModifier.POWER_HOUR
                );
            });
        });

        describe("is power hour", () => {
            it("should return power hour modifier", async () => {
                sandbox.stub(utils, "isPowerHour").callsFake(() => true);
                const modifiers = await calculateOptionsExpMultiplierInternal(
                    guildPreference,
                    false
                );

                assert.strictEqual(modifiers.length, 1);
                assert.strictEqual(
                    modifiers[0].name,
                    ExpBonusModifier.POWER_HOUR
                );
            });
        });
    });

    describe("everything", () => {
        it("should return all bonuses/penalties", async () => {
            sandbox.stub(utils, "isPowerHour").callsFake(() => true);
            sandbox.stub(utils, "isWeekend").callsFake(() => true);
            sandbox
                .stub(game_utils, "getAvailableSongCount")
                .callsFake(() =>
                    Promise.resolve({ count: 1, countBeforeLimit: 200 })
                );
            guildPreference.setAnswerType(AnswerType.MULTIPLE_CHOICE_HARD);
            await guildPreference.setGuessModeType(GuessModeType.BOTH);
            const modifiers = await calculateOptionsExpMultiplierInternal(
                guildPreference,
                true
            );

            assert.strictEqual(modifiers.length, 5);
            assert.ok(
                modifiers
                    .map((x) => x.name)
                    .every((x) =>
                        [
                            ExpBonusModifier.VOTE,
                            ExpBonusModifier.POWER_HOUR,
                            ExpBonusModifier.MC_GUESS_HARD,
                            ExpBonusModifier.BELOW_SONG_COUNT_THRESHOLD,
                            ExpBonusModifier.ARTIST_GUESS,
                        ].includes(x)
                    )
            );
        });
    });
});

describe("calculateRoundExpMultiplier", () => {
    let gameRound: GameRound;
    beforeEach(() => {
        gameRound = new GameRound("x", "x", "x", "x", new Date(), 1);
        guildPreference = GuildPreference.fromGuild("123");
        sandbox.stub(guildPreference, "updateGuildPreferences");
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe("participant exp scaling", () => {
        it("should increase EXP until a limit", () => {
            let roundExp = calculateRoundExpMultiplier(
                gameRound,
                1,
                0,
                1000,
                1
            );

            for (
                let i = 2;
                i <= exp.PARTICIPANT_MODIFIER_MAX_PARTICIPANTS;
                i++
            ) {
                const newRoundExp = calculateRoundExpMultiplier(
                    gameRound,
                    i,
                    0,
                    1000,
                    1
                );

                assert.ok(newRoundExp > roundExp);
                roundExp = newRoundExp;
            }

            const finalRoundExp = calculateRoundExpMultiplier(
                gameRound,
                exp.PARTICIPANT_MODIFIER_MAX_PARTICIPANTS + 1,
                0,
                1000,
                1
            );

            assert.ok(finalRoundExp === roundExp);
        });
    });

    describe("fast guess", () => {
        it("should apply fast guess bonus", () => {
            const slowGuessExp = calculateRoundExpMultiplier(
                gameRound,
                1,
                0,
                10000,
                1
            );

            const fastGuessExp = calculateRoundExpMultiplier(
                gameRound,
                1,
                0,
                50,
                1
            );

            assert.ok(
                fastGuessExp ===
                    slowGuessExp *
                        ExpBonusModifierValues[ExpBonusModifier.QUICK_GUESS]
            );
        });
    });

    describe("guess streak", () => {
        it("should apply guess streak bonus", () => {
            let roundExp = calculateRoundExpMultiplier(
                gameRound,
                1,
                0,
                1000,
                1
            );

            for (let i = 2; i < exp.GUESS_STREAK_THRESHOLD; i++) {
                const newRoundExp = calculateRoundExpMultiplier(
                    gameRound,
                    1,
                    i,
                    1000,
                    1
                );

                assert.ok(newRoundExp === roundExp);
                roundExp = newRoundExp;
            }

            const finalRoundExp = calculateRoundExpMultiplier(
                gameRound,
                1,
                exp.GUESS_STREAK_THRESHOLD,
                1000,
                1
            );

            assert.ok(
                finalRoundExp ===
                    roundExp *
                        ExpBonusModifierValues[ExpBonusModifier.GUESS_STREAK]
            );
        });
    });

    describe("bonus artist", () => {
        it("should apply bonus artist bonus", () => {
            const regularExp = calculateRoundExpMultiplier(
                gameRound,
                1,
                0,
                1000,
                1
            );

            sandbox.stub(gameRound, "isBonusArtist").callsFake(() => true);
            const bonusArtistExp = calculateRoundExpMultiplier(
                gameRound,
                1,
                0,
                1000,
                1
            );

            assert.ok(
                bonusArtistExp ===
                    regularExp *
                        ExpBonusModifierValues[ExpBonusModifier.BONUS_ARTIST]
            );
        });
    });

    describe("round bonus", () => {
        it("should apply round bonus", () => {
            const roundBonus = 25;
            const regularExp = calculateRoundExpMultiplier(
                gameRound,
                1,
                0,
                1000,
                1
            );

            gameRound.bonusModifier = roundBonus;
            const bonusArtistExp = calculateRoundExpMultiplier(
                gameRound,
                1,
                0,
                1000,
                1
            );

            assert.ok(bonusArtistExp === regularExp * roundBonus);
        });
    });

    describe("guess placement", () => {
        it("should apply guess placement penalty", () => {
            const place = 7;
            const regularExp = calculateRoundExpMultiplier(
                gameRound,
                1,
                0,
                1000,
                1
            );

            const lowerPlacementExp = calculateRoundExpMultiplier(
                gameRound,
                1,
                0,
                1000,
                place
            );

            assert.ok(lowerPlacementExp === regularExp / place);
        });
    });

    describe("everything", () => {
        it("should apply all modifiers", () => {
            const roundBonus = 50;
            const numParticipants =
                exp.PARTICIPANT_MODIFIER_MAX_PARTICIPANTS - 1;

            const place = 7;
            const guessStreak = exp.GUESS_STREAK_THRESHOLD + 1;
            gameRound.bonusModifier = roundBonus;
            sandbox.stub(gameRound, "isBonusArtist").callsFake(() => true);
            const expModifier = calculateRoundExpMultiplier(
                gameRound,
                numParticipants,
                guessStreak,
                50,
                place
            );

            assert.strictEqual(
                expModifier,
                (participantExpScalingModifier(numParticipants) *
                    ExpBonusModifierValues[ExpBonusModifier.QUICK_GUESS] *
                    ExpBonusModifierValues[ExpBonusModifier.GUESS_STREAK] *
                    ExpBonusModifierValues[ExpBonusModifier.BONUS_ARTIST] *
                    roundBonus) /
                    place
            );
        });
    });
});
