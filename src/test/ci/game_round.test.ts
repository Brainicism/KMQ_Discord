/* eslint-disable @typescript-eslint/dot-notation */
import assert from "assert";
import {
    ExpBonusModifier,
    ExpBonusModifierValues,
} from "../../commands/game_commands/exp";
import { GuessModeType } from "../../commands/game_options/guessmode";
import { state } from "../../kmq_worker";
import GameRound, {
    cleanArtistName,
    cleanSongName,
} from "../../structures/game_round";

let gameRound: GameRound;
describe("constructor defaults", () => {
    describe("artist/song names without aliases", () => {
        it("adds the corresponding name as a correct answer", () => {
            gameRound = new GameRound(
                "Song1",
                "Song1",
                "Jisoo",
                "abcde",
                new Date(),
                1000000
            );
            assert.deepStrictEqual(gameRound.acceptedArtistAnswers, ["Jisoo"]);
            assert.deepStrictEqual(gameRound.acceptedSongAnswers, ["Song1"]);
        });
    });

    describe("artist collabs", () => {
        it("should record them as two separate artists", () => {
            gameRound = new GameRound(
                "Poggers Song",
                "Poggers Song",
                "IU + Blackpink",
                "abcde",
                new Date(),
                69420
            );

            assert.deepStrictEqual(gameRound.acceptedArtistAnswers, [
                "IU",
                "Blackpink",
            ]);
        });
    });

    describe("artist name has trailing or leading spaces", () => {
        it("should remove them", () => {
            gameRound = new GameRound(
                "Lovesick Girls",
                "Lovesick Girls",
                " Blackpink + IU             ",
                "abcde",
                new Date(),
                123456789
            );

            assert.deepStrictEqual(gameRound.acceptedArtistAnswers, [
                "Blackpink",
                "IU",
            ]);
        });
    });

    describe("aliases", () => {
        beforeEach(() => {
            state.aliases.artist = {};
            state.aliases.song = {};
        });

        describe("song aliases", () => {
            describe("song has an alias", () => {
                it("records the aliases as an accepted answer", () => {
                    state.aliases.song["abcde"] = [
                        "An epic song",
                        "A good song",
                    ];

                    gameRound = new GameRound(
                        "A really epic song",
                        "A really epic song",
                        "A really epic person",
                        "abcde",
                        new Date(),
                        2
                    );

                    assert.deepStrictEqual(gameRound.acceptedSongAnswers, [
                        "A really epic song",
                        "An epic song",
                        "A good song",
                    ]);
                });
            });
        });

        describe("artist aliases", () => {
            describe("artist has an alias", () => {
                it("records the aliases as an accepted answer", () => {
                    state.aliases.artist["Person2"] = [
                        "Person Two",
                        "Person Too",
                    ];

                    gameRound = new GameRound(
                        "A really epic song",
                        "A really epic song",
                        "Person2",
                        "abcde",
                        new Date(),
                        5
                    );

                    assert.deepStrictEqual(gameRound.acceptedArtistAnswers, [
                        "Person2",
                        "Person Two",
                        "Person Too",
                    ]);
                });
            });
        });
    });
});

describe("clean song/artist name", () => {
    describe("has uppercase characters", () => {
        it("converts to full lower case", () => {
            assert.strictEqual(cleanSongName("BLahBLah"), "blahblah");
            assert.strictEqual(cleanArtistName("ClaHClaH"), "clahclah");
        });
    });

    describe("has trailing or leading spaces", () => {
        it("removes the whitespace", () => {
            assert.strictEqual(
                cleanSongName("       blahblah          "),
                "blahblah"
            );

            assert.strictEqual(
                cleanArtistName("       clahclah          "),
                "clahclah"
            );
        });
    });

    describe("has unwanted punctuation or symbols", () => {
        it("removes the specified list of removed punctuation", () => {
            assert.strictEqual(cleanSongName("!bl:ah blah?"), "blahblah");
            assert.strictEqual(cleanArtistName("!cl:ah clah?"), "clahclah");
        });
    });

    describe("has punctuation to replace", () => {
        it("replaces the punctuation with the correct replacement", () => {
            assert.strictEqual(cleanSongName("blah & blah"), "blahandblah");
            assert.strictEqual(cleanArtistName("clah & clah"), "clahandclah");
        });
    });

    describe("has brackets in them", () => {
        describe("artist names", () => {
            it("does not ignore the sections in the brackets", () => {
                assert.strictEqual(cleanArtistName("cla(hclah)"), "clahclah");
            });
        });
    });
});

describe("skipping", () => {
    beforeEach(() => {
        gameRound = new GameRound("1", "1", "2", "3", new Date(2015, 0), 123);
    });

    describe("unique skippers", () => {
        describe("one person skipping", () => {
            it("should increment the number of skippers by 1", () => {
                gameRound.userSkipped("user1");
                assert.strictEqual(gameRound.getNumSkippers(), 1);
            });
        });

        describe("3 people skipping", () => {
            it("should increment the number of skippers by 3", () => {
                gameRound.userSkipped("user1");
                gameRound.userSkipped("user2");
                gameRound.userSkipped("user3");
                assert.strictEqual(gameRound.getNumSkippers(), 3);
            });
        });
    });

    describe("duplicate skippers", () => {
        describe("one person skipping twice", () => {
            it("should increment the number of skippers by 1", () => {
                gameRound.userSkipped("user1");
                gameRound.userSkipped("user1");
                assert.strictEqual(gameRound.getNumSkippers(), 1);
            });
        });

        describe("2 unique people skipping, total of 3 times", () => {
            it("should increment the number of skippers by 2", () => {
                gameRound.userSkipped("user1");
                gameRound.userSkipped("user2");
                gameRound.userSkipped("user2");
                assert.strictEqual(gameRound.getNumSkippers(), 2);
            });
        });
    });
});

describe("check guess", () => {
    beforeEach(() => {
        gameRound = new GameRound(
            "very cool song",
            "very cool song",
            "artist",
            "a1b2c3",
            new Date(2015, 0),
            3141592653589
        );
    });

    describe("incorrect guess", () => {
        it("should return 0 points", () => {
            assert.strictEqual(
                gameRound.checkGuess("wrong_song", GuessModeType.SONG_NAME),
                0
            );

            assert.strictEqual(
                gameRound.checkGuess("wrong_artist", GuessModeType.ARTIST),
                0
            );

            assert.strictEqual(
                gameRound.checkGuess("wrong_both", GuessModeType.BOTH),
                0
            );
        });
    });

    describe("correct guess", () => {
        describe("similarity mode enabled", () => {
            it("should apply the appropriate multiplier", () => {
                // exact answer
                assert.strictEqual(
                    gameRound.checkGuess(
                        "very cool song",
                        GuessModeType.SONG_NAME,
                        true
                    ),
                    ExpBonusModifierValues[ExpBonusModifier.TYPO]
                );

                // similar answer
                assert.strictEqual(
                    gameRound.checkGuess(
                        "very cool sogn",
                        GuessModeType.SONG_NAME,
                        true
                    ),
                    ExpBonusModifierValues[ExpBonusModifier.TYPO]
                );

                // incorrect answer
                assert.strictEqual(
                    gameRound.checkGuess(
                        "very cool songggggggggggggggg",
                        GuessModeType.SONG_NAME,
                        true
                    ),
                    0
                );
            });
        });

        describe("hint used", () => {
            it("should return half the amount of points", () => {
                gameRound.hintUsed = true;
                assert.strictEqual(
                    gameRound.checkGuess(
                        "very cool song",
                        GuessModeType.SONG_NAME
                    ),
                    0.5
                );
            });
        });

        describe("song guessing mode", () => {
            it("should return 1 point", () => {
                assert.strictEqual(
                    gameRound.checkGuess(
                        "very cool song",
                        GuessModeType.SONG_NAME
                    ),
                    1
                );
            });
        });

        describe("artist guessing mode", () => {
            it("should return 1 point", () => {
                assert.strictEqual(
                    gameRound.checkGuess("artist", GuessModeType.ARTIST),
                    1
                );
            });
        });

        describe("both guessing mode", () => {
            describe("guessed song", () => {
                it("should return 1 point", () => {
                    assert.strictEqual(
                        gameRound.checkGuess(
                            "very cool song",
                            GuessModeType.BOTH
                        ),
                        1
                    );
                });
            });

            describe("guessed artist", () => {
                it("should return 0.2 points", () => {
                    assert.strictEqual(
                        gameRound.checkGuess("artist", GuessModeType.BOTH),
                        0.2
                    );
                });
            });
        });
    });
});

describe("similarityCheck", () => {
    describe("precise match", () => {
        it("should return true", () => {
            assert.ok(GameRound.similarityCheck("abcefg", ["abcdefg"]));
        });
    });

    describe("meets similarity criteria", () => {
        it("should return true", () => {
            // 1 transposition error
            assert.ok(GameRound.similarityCheck("abcdegf", ["abcdefg"]));
            // 2 transposition errors
            assert.ok(GameRound.similarityCheck("bacdegf", ["abcdefg"]));
            // 1 removal required
            assert.ok(GameRound.similarityCheck("abcdefgh", ["abcdefg"]));
            // 1 removal, one transposition error
            assert.ok(GameRound.similarityCheck("bacdefgh", ["abcdefg"]));
            // 1 insertion required
            assert.ok(GameRound.similarityCheck("abcdef", ["abcdefg"]));
            // 1 insertion required, one transposition error
            assert.ok(GameRound.similarityCheck("bacdef", ["abcdefg"]));
        });
    });

    describe("does not meet similarity criteria", () => {
        it("should return false", () => {
            // 3 transposition errors
            assert.ok(!GameRound.similarityCheck("badcegf", ["abcdefg"]));
            // 2 removals required
            assert.ok(!GameRound.similarityCheck("abcdefghi", ["abcdefg"]));
            // 2 insertions required
            assert.ok(!GameRound.similarityCheck("abcde", ["abcdefg"]));
            // correct choice is too short, transposition error
            assert.ok(!GameRound.similarityCheck("bacd", ["abcd"]));
            // correct choice is too short, insertion required
            assert.ok(!GameRound.similarityCheck("abd", ["abcd"]));
            // correct choice is too short, removal required
            assert.ok(!GameRound.similarityCheck("abcde", ["abcd"]));
        });
    });

    describe("multiple correct choices", () => {
        describe("no choices meet criteria", () => {
            it("should return false", () => {
                assert.ok(
                    !GameRound.similarityCheck("abcde", [
                        "..........",
                        "eleven",
                        "12345",
                    ])
                );
            });
        });

        describe("atleast one choice meets criteria", () => {
            it("should return true", () => {
                // 1 transposition error
                assert.ok(
                    GameRound.similarityCheck("abcdegf", [
                        "1234567",
                        "abcdefg",
                        "5454544545",
                    ])
                );

                // 2 transposition errors
                assert.ok(
                    GameRound.similarityCheck("bacdegf", [
                        "1234567",
                        "abcdefg",
                        "5454544545",
                    ])
                );

                // 1 removal required
                assert.ok(
                    GameRound.similarityCheck("abcdefgh", [
                        "1234567",
                        "abcdefg",
                        "5454544545",
                    ])
                );

                // 1 removal, one transposition error
                assert.ok(
                    GameRound.similarityCheck("bacdefgh", [
                        "1234567",
                        "abcdefg",
                        "5454544545",
                    ])
                );

                // 1 insertion required
                assert.ok(
                    GameRound.similarityCheck("abcdef", [
                        "1234567",
                        "abcdefg",
                        "5454544545",
                    ])
                );

                // 1 insertion required, one transposition error
                assert.ok(
                    GameRound.similarityCheck("bacdef", [
                        "1234567",
                        "abcdefg",
                        "5454544545",
                    ])
                );
            });
        });
    });
});

describe("getExpReward", () => {
    const exp = 500;
    beforeEach(() => {
        gameRound = new GameRound(
            "very cool song",
            "very cool song",
            "artist",
            "a1b2c3",
            new Date(2015),
            246810121416
        );
    });

    describe("no hint used", () => {
        it("should return the same amount of exp", () => {
            gameRound.setBaseExpReward(exp);
            assert.strictEqual(gameRound.getExpReward(), exp);
        });
    });

    describe("hint used", () => {
        it("should return the same amount of exp", () => {
            gameRound.setBaseExpReward(exp);
            gameRound.hintUsed = true;
            assert.strictEqual(gameRound.getExpReward(), exp / 2);
        });
    });
});
