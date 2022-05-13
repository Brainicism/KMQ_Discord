import * as game_utils from "../../helpers/game_utils";
import * as utils from "../../helpers/utils";
import {
    ExpBonusModifierValues,
    GUESS_STREAK_THRESHOLD,
    PARTICIPANT_MODIFIER_MAX_PARTICIPANTS,
} from "../../constants";
import {
    calculateOptionsExpMultiplierInternal,
    calculateRoundExpMultiplier,
    participantExpScalingModifier,
} from "../../commands/game_commands/exp";
import AnswerType from "../../enums/option_types/answer_type";
import ExpBonusModifier from "../../enums/exp_bonus_modifier";
import GameRound from "../../structures/game_round";
import Gender from "../../enums/option_types/gender";
import GuessModeType from "../../enums/option_types/guess_mode_type";
import GuildPreference from "../../structures/guild_preference";
import ShuffleType from "../../enums/option_types/shuffle_type";
import assert from "assert";
import sinon from "sinon";

describe("exp command", () => {
    let guildPreference: GuildPreference;
    const sandbox = sinon.createSandbox();
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
                sandbox.stub(game_utils, "isPowerHour").callsFake(() => false);
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

                    sandbox
                        .stub(game_utils, "isFirstGameOfDay")
                        .callsFake(() => Promise.resolve(false));
                });

                it("should return insufficient song count penalty", async () => {
                    const modifiers =
                        await calculateOptionsExpMultiplierInternal(
                            guildPreference,
                            false,
                            null
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
                            Promise.resolve({
                                count: 200,
                                countBeforeLimit: 200,
                            })
                        );

                    sandbox
                        .stub(game_utils, "isFirstGameOfDay")
                        .callsFake(() => Promise.resolve(false));
                });

                describe("no active modifiers", () => {
                    it("should return empty array", async () => {
                        const modifiers =
                            await calculateOptionsExpMultiplierInternal(
                                guildPreference,
                                false,
                                null
                            );

                        assert.strictEqual(modifiers.length, 0);
                    });
                });

                describe("vote bonus", () => {
                    it("should return vote bonus modifier", async () => {
                        const modifiers =
                            await calculateOptionsExpMultiplierInternal(
                                guildPreference,
                                true,
                                null
                            );

                        assert.strictEqual(modifiers.length, 1);
                        assert.strictEqual(
                            modifiers[0].name,
                            ExpBonusModifier.VOTE
                        );
                    });
                });

                describe("shuffle popularity penalty", () => {
                    it("should return vote bonus modifier", async () => {
                        await guildPreference.setShuffleType(
                            ShuffleType.POPULARITY
                        );

                        const modifiers =
                            await calculateOptionsExpMultiplierInternal(
                                guildPreference,
                                false,
                                null
                            );

                        assert.strictEqual(modifiers.length, 1);
                        assert.strictEqual(
                            modifiers[0].name,
                            ExpBonusModifier.SHUFFLE_POPULARITY
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
                            guildPreference.setAnswerType(
                                answerType as AnswerType
                            );
                            const modifiers =
                                await calculateOptionsExpMultiplierInternal(
                                    guildPreference,
                                    false,
                                    null
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
                                    false,
                                    null
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
                                    false,
                                    null
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
                                    false,
                                    null
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

                sandbox
                    .stub(game_utils, "isFirstGameOfDay")
                    .callsFake(() => Promise.resolve(false));
            });

            describe("is weekend", () => {
                it("should return power hour modifier", async () => {
                    sandbox.stub(utils, "isWeekend").callsFake(() => true);
                    const modifiers =
                        await calculateOptionsExpMultiplierInternal(
                            guildPreference,
                            false,
                            null
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
                    sandbox
                        .stub(game_utils, "isPowerHour")
                        .callsFake(() => true);
                    const modifiers =
                        await calculateOptionsExpMultiplierInternal(
                            guildPreference,
                            false,
                            null
                        );

                    assert.strictEqual(modifiers.length, 1);
                    assert.strictEqual(
                        modifiers[0].name,
                        ExpBonusModifier.POWER_HOUR
                    );
                });
            });
        });

        describe("first game of day", () => {
            beforeEach(() => {
                sandbox
                    .stub(game_utils, "isFirstGameOfDay")
                    .callsFake(() => Promise.resolve(true));
            });

            afterEach(() => {
                sandbox.restore();
            });

            describe("is first game of day", async () => {
                const modifiers = await calculateOptionsExpMultiplierInternal(
                    guildPreference,
                    false,
                    null
                );

                assert.strictEqual(modifiers.length, 1);
                assert.strictEqual(
                    modifiers[0].name,
                    ExpBonusModifier.FIRST_GAME_OF_DAY
                );
            });
        });

        describe("everything", () => {
            beforeEach(() => {
                sandbox.stub(game_utils, "isPowerHour").callsFake(() => true);
                sandbox.stub(utils, "isWeekend").callsFake(() => true);
                sandbox
                    .stub(game_utils, "getAvailableSongCount")
                    .callsFake(() =>
                        Promise.resolve({ count: 1, countBeforeLimit: 200 })
                    );

                sandbox
                    .stub(game_utils, "isFirstGameOfDay")
                    .callsFake(() => Promise.resolve(true));
            });

            afterEach(() => {
                sandbox.restore();
            });

            it("should return all bonuses/penalties", async () => {
                guildPreference.setAnswerType(AnswerType.MULTIPLE_CHOICE_HARD);
                await guildPreference.setGuessModeType(GuessModeType.BOTH);
                const modifiers = await calculateOptionsExpMultiplierInternal(
                    guildPreference,
                    true,
                    null
                );

                const expectedModifiers = [
                    ExpBonusModifier.VOTE,
                    ExpBonusModifier.POWER_HOUR,
                    ExpBonusModifier.MC_GUESS_HARD,
                    ExpBonusModifier.BELOW_SONG_COUNT_THRESHOLD,
                    ExpBonusModifier.ARTIST_GUESS,
                    ExpBonusModifier.FIRST_GAME_OF_DAY,
                ];

                assert.strictEqual(modifiers.length, expectedModifiers.length);
                assert.ok(
                    modifiers
                        .map((x) => x.name)
                        .every((x) => expectedModifiers.includes(x))
                );
            });
        });
    });

    describe("calculateRoundExpMultiplier", () => {
        let gameRound: GameRound;
        beforeEach(() => {
            gameRound = new GameRound({
                songName: "x",
                originalSongName: "x",
                hangulSongName: "x",
                originalHangulSongName: "x",
                artistName: "x",
                hangulArtistName: "x",
                youtubeLink: "x",
                publishDate: new Date(),
                members: Gender.FEMALE,
                artistID: 1,
                isSolo: "y",
                rank: 0,
                views: 1,
                tags: "",
                vtype: "main",
                selectionWeight: 1,
            });
            gameRound.bonusModifier = 1;
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
                    i <= PARTICIPANT_MODIFIER_MAX_PARTICIPANTS;
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
                    PARTICIPANT_MODIFIER_MAX_PARTICIPANTS + 1,
                    0,
                    1000,
                    1
                );

                assert.strictEqual(finalRoundExp, roundExp);
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

                assert.strictEqual(
                    fastGuessExp,
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

                for (let i = 2; i < GUESS_STREAK_THRESHOLD; i++) {
                    const newRoundExp = calculateRoundExpMultiplier(
                        gameRound,
                        1,
                        i,
                        1000,
                        1
                    );

                    assert.strictEqual(newRoundExp, roundExp);
                    roundExp = newRoundExp;
                }

                const finalRoundExp = calculateRoundExpMultiplier(
                    gameRound,
                    1,
                    GUESS_STREAK_THRESHOLD,
                    1000,
                    1
                );

                assert.strictEqual(
                    finalRoundExp,
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

                assert.strictEqual(
                    bonusArtistExp,
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

                assert.strictEqual(bonusArtistExp, regularExp * roundBonus);
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

                assert.strictEqual(lowerPlacementExp, regularExp / place);
            });
        });

        describe("everything", () => {
            it("should apply all modifiers", () => {
                const roundBonus = 50;
                const numParticipants =
                    PARTICIPANT_MODIFIER_MAX_PARTICIPANTS - 1;

                const place = 7;
                const guessStreak = GUESS_STREAK_THRESHOLD + 1;
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
});
