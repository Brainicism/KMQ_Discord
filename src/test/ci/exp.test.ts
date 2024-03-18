import * as game_utils from "../../helpers/game_utils";
import * as utils from "../../helpers/utils";
import {
    ExpBonusModifierValues,
    GUESS_STREAK_THRESHOLD,
    PARTICIPANT_MODIFIER_MAX_PARTICIPANTS,
} from "../../constants";

import AnswerType from "../../enums/option_types/answer_type";
import ExpBonusModifier from "../../enums/exp_bonus_modifier";
import ExpCommand from "../../commands/game_commands/exp";
import GameRound from "../../structures/game_round";
import GuessModeType from "../../enums/option_types/guess_mode_type";
import GuildPreference from "../../structures/guild_preference";
import QueriedSong from "../../structures/queried_song";
import ShuffleType from "../../enums/option_types/shuffle_type";
import assert from "assert";
import sinon from "sinon";

describe("exp command", () => {
    let guildPreference: GuildPreference;
    const sandbox = sinon.createSandbox();
    describe("calculateOptionsMultiplier", () => {
        beforeEach(async () => {
            guildPreference = GuildPreference.fromGuild("123");
            await guildPreference.setAnswerType(AnswerType.TYPING);
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
                            Promise.resolve({
                                count: 1,
                                countBeforeLimit: 200,
                                ineligibleDueToCommonAlias: 0,
                            }),
                        );

                    sandbox
                        .stub(game_utils, "isFirstGameOfDay")
                        .callsFake(() => Promise.resolve(false));
                });

                it("should return insufficient song count penalty", async () => {
                    const modifiers =
                        await ExpCommand.calculateOptionsExpMultiplierInternal(
                            guildPreference,
                            false,
                            "dummy",
                        );

                    assert.strictEqual(modifiers.length, 1);
                    assert.strictEqual(
                        modifiers[0].name,
                        ExpBonusModifier.BELOW_SONG_COUNT_THRESHOLD,
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
                                ineligibleDueToCommonAlias: 0,
                            }),
                        );

                    sandbox
                        .stub(game_utils, "isFirstGameOfDay")
                        .callsFake(() => Promise.resolve(false));
                });

                describe("no active modifiers", () => {
                    it("should return empty array", async () => {
                        const modifiers =
                            await ExpCommand.calculateOptionsExpMultiplierInternal(
                                guildPreference,
                                false,
                                "dummy",
                            );

                        assert.strictEqual(modifiers.length, 0);
                    });
                });

                describe("vote bonus", () => {
                    it("should return vote bonus modifier", async () => {
                        const modifiers =
                            await ExpCommand.calculateOptionsExpMultiplierInternal(
                                guildPreference,
                                true,
                                "dummy",
                            );

                        assert.strictEqual(modifiers.length, 1);
                        assert.strictEqual(
                            modifiers[0].name,
                            ExpBonusModifier.VOTE,
                        );
                    });
                });

                describe("shuffle popularity penalty", () => {
                    it("should return shuffle popularity modifier", async () => {
                        await guildPreference.setShuffleType(
                            ShuffleType.POPULARITY,
                        );

                        const modifiers =
                            await ExpCommand.calculateOptionsExpMultiplierInternal(
                                guildPreference,
                                false,
                                "dummy",
                            );

                        assert.strictEqual(modifiers.length, 1);
                        assert.strictEqual(
                            modifiers[0].name,
                            ExpBonusModifier.SHUFFLE_POPULARITY,
                        );
                    });
                });

                describe("shuffle weighted easy penalty", () => {
                    it("should return shuffle weighted easy modifier", async () => {
                        await guildPreference.setShuffleType(
                            ShuffleType.WEIGHTED_EASY,
                        );

                        const modifiers =
                            await ExpCommand.calculateOptionsExpMultiplierInternal(
                                guildPreference,
                                false,
                                "dummy",
                            );

                        assert.strictEqual(modifiers.length, 1);
                        assert.strictEqual(
                            modifiers[0].name,
                            ExpBonusModifier.SHUFFLE_WEIGHTED_EASY,
                        );
                    });
                });

                describe("shuffle chronological penalty", () => {
                    it("should return shuffle chronological modifier", async () => {
                        await guildPreference.setShuffleType(
                            ShuffleType.CHRONOLOGICAL,
                        );

                        const modifiers =
                            await ExpCommand.calculateOptionsExpMultiplierInternal(
                                guildPreference,
                                false,
                                "dummy",
                            );

                        assert.strictEqual(modifiers.length, 1);
                        assert.strictEqual(
                            modifiers[0].name,
                            ExpBonusModifier.SHUFFLE_CHRONOLOGICAL,
                        );
                    });
                });

                describe("shuffle reverse chronological penalty", () => {
                    it("should return shuffle chronological modifier", async () => {
                        await guildPreference.setShuffleType(
                            ShuffleType.REVERSE_CHRONOLOGICAL,
                        );

                        const modifiers =
                            await ExpCommand.calculateOptionsExpMultiplierInternal(
                                guildPreference,
                                false,
                                "dummy",
                            );

                        assert.strictEqual(modifiers.length, 1);
                        assert.strictEqual(
                            modifiers[0].name,
                            ExpBonusModifier.SHUFFLE_CHRONOLOGICAL,
                        );
                    });
                });

                describe("multiple choice penalty", () => {
                    const multipleChoicePenaltyMap: {
                        [difficulty: string]: number;
                    } = {
                        [AnswerType.MULTIPLE_CHOICE_EASY]:
                            ExpBonusModifier.MC_GUESS_EASY,
                        [AnswerType.MULTIPLE_CHOICE_MED]:
                            ExpBonusModifier.MC_GUESS_MEDIUM,
                        [AnswerType.MULTIPLE_CHOICE_HARD]:
                            ExpBonusModifier.MC_GUESS_HARD,
                    };

                    for (const answerType of Object.keys(
                        multipleChoicePenaltyMap,
                    )) {
                        // eslint-disable-next-line @typescript-eslint/no-loop-func
                        it(`should return corresponding multiple choice penalty (${answerType})`, async () => {
                            await guildPreference.setAnswerType(
                                answerType as AnswerType,
                            );
                            const modifiers =
                                await ExpCommand.calculateOptionsExpMultiplierInternal(
                                    guildPreference,
                                    false,
                                    "dummy",
                                );

                            assert.strictEqual(modifiers.length, 1);
                            assert.strictEqual(
                                modifiers[0].name,
                                multipleChoicePenaltyMap[answerType],
                            );
                        });
                    }
                });

                describe("artist/group guess mode", () => {
                    describe("artist guess mode", () => {
                        it("should return artist guess penalty", async () => {
                            await guildPreference.setGuessModeType(
                                GuessModeType.ARTIST,
                            );
                            const modifiers =
                                await ExpCommand.calculateOptionsExpMultiplierInternal(
                                    guildPreference,
                                    false,
                                    "dummy",
                                );

                            assert.strictEqual(modifiers.length, 1);
                            assert.strictEqual(
                                modifiers[0].name,
                                ExpBonusModifier.ARTIST_GUESS,
                            );
                        });
                    });

                    describe("'both' guess mode", () => {
                        it("should return artist guess penalty", async () => {
                            await guildPreference.setGuessModeType(
                                GuessModeType.BOTH,
                            );
                            const modifiers =
                                await ExpCommand.calculateOptionsExpMultiplierInternal(
                                    guildPreference,
                                    false,
                                    "dummy",
                                );

                            assert.strictEqual(modifiers.length, 1);
                            assert.strictEqual(
                                modifiers[0].name,
                                ExpBonusModifier.ARTIST_GUESS,
                            );
                        });
                    });

                    describe("groups mode also selected", () => {
                        it("should return artist guess + groups mode penalty", async () => {
                            await guildPreference.setGuessModeType(
                                GuessModeType.BOTH,
                            );

                            await guildPreference.setGroups([
                                { id: 1, name: "aespa" },
                            ]);
                            const modifiers =
                                await ExpCommand.calculateOptionsExpMultiplierInternal(
                                    guildPreference,
                                    false,
                                    "dummy",
                                );

                            assert.strictEqual(modifiers.length, 1);
                            assert.strictEqual(
                                modifiers[0].name,
                                ExpBonusModifier.ARTIST_GUESS_GROUPS_SELECTED,
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
                        Promise.resolve({
                            count: 200,
                            countBeforeLimit: 200,
                            ineligibleDueToCommonAlias: 0,
                        }),
                    );

                sandbox
                    .stub(game_utils, "isFirstGameOfDay")
                    .callsFake(() => Promise.resolve(false));
            });

            describe("is weekend", () => {
                it("should return power hour modifier", async () => {
                    sandbox.stub(utils, "isWeekend").callsFake(() => true);
                    const modifiers =
                        await ExpCommand.calculateOptionsExpMultiplierInternal(
                            guildPreference,
                            false,
                            "dummy",
                        );

                    assert.strictEqual(modifiers.length, 1);
                    assert.strictEqual(
                        modifiers[0].name,
                        ExpBonusModifier.POWER_HOUR,
                    );
                });
            });

            describe("is power hour", () => {
                it("should return power hour modifier", async () => {
                    sandbox
                        .stub(game_utils, "isPowerHour")
                        .callsFake(() => true);
                    const modifiers =
                        await ExpCommand.calculateOptionsExpMultiplierInternal(
                            guildPreference,
                            false,
                            "dummy",
                        );

                    assert.strictEqual(modifiers.length, 1);
                    assert.strictEqual(
                        modifiers[0].name,
                        ExpBonusModifier.POWER_HOUR,
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
                const modifiers =
                    await ExpCommand.calculateOptionsExpMultiplierInternal(
                        guildPreference,
                        false,
                        "dummy",
                    );

                assert.strictEqual(modifiers.length, 1);
                assert.strictEqual(
                    modifiers[0].name,
                    ExpBonusModifier.FIRST_GAME_OF_DAY,
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
                        Promise.resolve({
                            count: 1,
                            countBeforeLimit: 200,
                            ineligibleDueToCommonAlias: 0,
                        }),
                    );

                sandbox
                    .stub(game_utils, "isFirstGameOfDay")
                    .callsFake(() => Promise.resolve(true));
            });

            afterEach(() => {
                sandbox.restore();
            });

            it("should return all bonuses/penalties", async () => {
                await guildPreference.setAnswerType(
                    AnswerType.MULTIPLE_CHOICE_HARD,
                );
                await guildPreference.setGuessModeType(GuessModeType.BOTH);
                const modifiers =
                    await ExpCommand.calculateOptionsExpMultiplierInternal(
                        guildPreference,
                        true,
                        "dummy",
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
                        .every((x) => expectedModifiers.includes(x)),
                );
            });
        });
    });

    describe("ExpCommand.calculateRoundExpMultiplier", () => {
        let gameRound: GameRound;
        beforeEach(() => {
            gameRound = new GameRound(
                new QueriedSong({
                    songName: "x",
                    hangulSongName: "x",
                    artistName: "x",
                    hangulArtistName: "x",
                    youtubeLink: "x",
                    originalLink: null,
                    publishDate: new Date(),
                    members: "female",
                    artistID: 1,
                    isSolo: "y",
                    views: 1,
                    tags: "",
                    vtype: "main",
                    selectionWeight: 1,
                }),
                5,
            );
            gameRound.bonusModifier = 1;
            guildPreference = GuildPreference.fromGuild("123");
            sandbox.stub(guildPreference, "updateGuildPreferences");
        });

        afterEach(() => {
            sandbox.restore();
        });

        describe("participant exp scaling", () => {
            it("should increase EXP until a limit", () => {
                let roundExp = ExpCommand.calculateRoundExpMultiplier(
                    gameRound,
                    1,
                    0,
                    1000,
                    1,
                );

                for (
                    let i = 2;
                    i <= PARTICIPANT_MODIFIER_MAX_PARTICIPANTS;
                    i++
                ) {
                    const newRoundExp = ExpCommand.calculateRoundExpMultiplier(
                        gameRound,
                        i,
                        0,
                        1000,
                        1,
                    );

                    assert.ok(newRoundExp > roundExp);
                    roundExp = newRoundExp;
                }

                const finalRoundExp = ExpCommand.calculateRoundExpMultiplier(
                    gameRound,
                    PARTICIPANT_MODIFIER_MAX_PARTICIPANTS + 1,
                    0,
                    1000,
                    1,
                );

                assert.strictEqual(finalRoundExp, roundExp);
            });
        });

        describe("fast guess", () => {
            it("should apply fast guess bonus", () => {
                const slowGuessExp = ExpCommand.calculateRoundExpMultiplier(
                    gameRound,
                    1,
                    0,
                    10000,
                    1,
                );

                const fastGuessExp = ExpCommand.calculateRoundExpMultiplier(
                    gameRound,
                    1,
                    0,
                    50,
                    1,
                );

                assert.strictEqual(
                    fastGuessExp,
                    slowGuessExp *
                        ExpBonusModifierValues[ExpBonusModifier.QUICK_GUESS],
                );
            });
        });

        describe("guess streak", () => {
            it("should apply guess streak bonus", () => {
                let roundExp = ExpCommand.calculateRoundExpMultiplier(
                    gameRound,
                    1,
                    0,
                    1000,
                    1,
                );

                for (let i = 2; i < GUESS_STREAK_THRESHOLD; i++) {
                    const newRoundExp = ExpCommand.calculateRoundExpMultiplier(
                        gameRound,
                        1,
                        i,
                        1000,
                        1,
                    );

                    assert.strictEqual(newRoundExp, roundExp);
                    roundExp = newRoundExp;
                }

                const finalRoundExp = ExpCommand.calculateRoundExpMultiplier(
                    gameRound,
                    1,
                    GUESS_STREAK_THRESHOLD,
                    1000,
                    1,
                );

                assert.strictEqual(
                    finalRoundExp,
                    roundExp *
                        ExpBonusModifierValues[ExpBonusModifier.GUESS_STREAK],
                );
            });
        });

        describe("bonus artist", () => {
            it("should apply bonus artist bonus", () => {
                const regularExp = ExpCommand.calculateRoundExpMultiplier(
                    gameRound,
                    1,
                    0,
                    1000,
                    1,
                );

                sandbox.stub(gameRound, "isBonusArtist").callsFake(() => true);
                const bonusArtistExp = ExpCommand.calculateRoundExpMultiplier(
                    gameRound,
                    1,
                    0,
                    1000,
                    1,
                );

                assert.strictEqual(
                    bonusArtistExp,
                    regularExp *
                        ExpBonusModifierValues[ExpBonusModifier.BONUS_ARTIST],
                );
            });
        });

        describe("round bonus", () => {
            it("should apply round bonus", () => {
                const roundBonus = 25;
                const regularExp = ExpCommand.calculateRoundExpMultiplier(
                    gameRound,
                    1,
                    0,
                    1000,
                    1,
                );

                gameRound.bonusModifier = roundBonus;
                const bonusArtistExp = ExpCommand.calculateRoundExpMultiplier(
                    gameRound,
                    1,
                    0,
                    1000,
                    1,
                );

                assert.strictEqual(bonusArtistExp, regularExp * roundBonus);
            });
        });

        describe("guess placement", () => {
            it("should apply guess placement penalty", () => {
                const place = 7;
                const regularExp = ExpCommand.calculateRoundExpMultiplier(
                    gameRound,
                    1,
                    0,
                    1000,
                    1,
                );

                const lowerPlacementExp =
                    ExpCommand.calculateRoundExpMultiplier(
                        gameRound,
                        1,
                        0,
                        1000,
                        place,
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
                const expModifier = ExpCommand.calculateRoundExpMultiplier(
                    gameRound,
                    numParticipants,
                    guessStreak,
                    50,
                    place,
                );

                assert.strictEqual(
                    expModifier,
                    (ExpCommand.participantExpScalingModifier(numParticipants) *
                        ExpBonusModifierValues[ExpBonusModifier.QUICK_GUESS] *
                        ExpBonusModifierValues[ExpBonusModifier.GUESS_STREAK] *
                        ExpBonusModifierValues[ExpBonusModifier.BONUS_ARTIST] *
                        roundBonus) /
                        place,
                );
            });
        });
    });
});
