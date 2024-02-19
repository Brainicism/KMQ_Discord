/* eslint-disable @typescript-eslint/dot-notation */
import { ExpBonusModifierValues } from "../../constants";
import { delay } from "../../helpers/utils";
import ExpBonusModifier from "../../enums/exp_bonus_modifier";
import GameRound, {
    cleanArtistName,
    normalizePunctuationInName,
} from "../../structures/game_round";
import GuessModeType from "../../enums/option_types/guess_mode_type";
import State from "../../state";
import assert from "assert";

describe("game round", () => {
    let gameRound: GameRound;
    describe("constructor defaults", () => {
        describe("artist/song names without aliases", () => {
            it("adds the corresponding name as a correct answer", () => {
                gameRound = new GameRound(
                    {
                        songName: "Song1",
                        originalSongName: "Song1",
                        hangulSongName: "노래1",
                        originalHangulSongName: "노래1",
                        artistName: "Jisoo",
                        hangulArtistName: "지수",
                        youtubeLink: "abcde",
                        originalLink: null,
                        publishDate: new Date(),
                        members: "female",
                        artistID: 1,
                        isSolo: "y",
                        views: 1000000,
                        tags: "",
                        vtype: "main",
                        selectionWeight: 1,
                    },
                    5,
                );

                assert.deepStrictEqual(gameRound.acceptedArtistAnswers, [
                    "Jisoo",
                    "지수",
                ]);

                assert.deepStrictEqual(gameRound.acceptedSongAnswers, [
                    "Song1",
                    "노래1",
                ]);
            });
        });

        describe("artist collabs", () => {
            it("should record them as two separate artists", () => {
                gameRound = new GameRound(
                    {
                        songName: "Poggers Song",
                        originalSongName: "Poggers Song",
                        hangulSongName: "리그마 포트나이트",
                        originalHangulSongName: "리그마 포트나이트",
                        artistName: "IU + Blackpink",
                        hangulArtistName: "아이유+블랙핑크",
                        youtubeLink: "abcde",
                        originalLink: null,
                        publishDate: new Date(),
                        members: "female",
                        artistID: 2,
                        isSolo: "n",
                        views: 69420,
                        tags: "",
                        vtype: "main",
                        selectionWeight: 1,
                    },
                    5,
                );

                assert.deepStrictEqual(gameRound.acceptedArtistAnswers, [
                    "IU",
                    "Blackpink",
                    "아이유",
                    "블랙핑크",
                ]);
            });
        });

        describe("artist name has a bracket (indicating alternative name)", () => {
            it("should add the alternative name as an accepted artist name", () => {
                gameRound = new GameRound(
                    {
                        songName: "Good Girls in the Dark",
                        originalSongName: "Good Girls in the Dark",
                        hangulSongName: "상사병에 걸린 소녀들",
                        originalHangulSongName: "상사병에 걸린 소녀들",
                        artistName: "Yena (Choi Yena)",
                        hangulArtistName: "최예나 (나)",
                        youtubeLink: "abcde",
                        originalLink: null,
                        publishDate: new Date(),
                        members: "female",
                        artistID: 3,
                        isSolo: "y",
                        views: 123456789,
                        tags: "",
                        vtype: "main",
                        selectionWeight: 1,
                    },
                    5,
                );

                assert.deepStrictEqual(gameRound.acceptedArtistAnswers, [
                    "Yena",
                    "Choi Yena",
                    "최예나",
                    "나",
                ]);
            });
        });

        describe("artist name has trailing or leading spaces", () => {
            it("should remove them", () => {
                gameRound = new GameRound(
                    {
                        songName: "Lovesick Girls",
                        originalSongName: "Lovesick Girls",
                        hangulSongName: "상사병에 걸린 소녀들",
                        originalHangulSongName: "상사병에 걸린 소녀들",
                        artistName: " Blackpink + IU             ",
                        hangulArtistName: "   블랙핑크+아이유                ",
                        youtubeLink: "abcde",
                        originalLink: null,
                        publishDate: new Date(),
                        members: "female",
                        artistID: 3,
                        isSolo: "y",
                        views: 123456789,
                        tags: "",
                        vtype: "main",
                        selectionWeight: 1,
                    },
                    5,
                );

                assert.deepStrictEqual(gameRound.acceptedArtistAnswers, [
                    "Blackpink",
                    "IU",
                    "블랙핑크",
                    "아이유",
                ]);
            });
        });

        describe("aliases", () => {
            beforeEach(() => {
                State.aliases.artist = {};
                State.aliases.song = {};
            });

            describe("song aliases", () => {
                describe("song has an alias", () => {
                    it("records the aliases as an accepted answer", () => {
                        State.aliases.song["abcde"] = [
                            "An epic song",
                            "A good song",
                        ];

                        gameRound = new GameRound(
                            {
                                songName: "A really epic song",
                                originalSongName: "A really epic song",
                                hangulSongName: "정말 서사시 노래",
                                originalHangulSongName: "정말 서사시 노래",
                                artistName: "A really epic person",
                                hangulArtistName: "정말 서사시인",
                                youtubeLink: "abcde",
                                originalLink: null,
                                publishDate: new Date(),
                                members: "male",
                                artistID: 4,
                                isSolo: "y",
                                views: 2,
                                tags: "",
                                vtype: "main",
                                selectionWeight: 1,
                            },
                            5,
                        );

                        assert.deepStrictEqual(gameRound.acceptedSongAnswers, [
                            "A really epic song",
                            "An epic song",
                            "A good song",
                            "정말 서사시 노래",
                        ]);
                    });
                });
            });

            describe("artist aliases", () => {
                describe("artist has an alias", () => {
                    it("records the aliases as an accepted answer", () => {
                        State.aliases.artist["Person2"] = [
                            "Person Two",
                            "Person Too",
                        ];

                        gameRound = new GameRound(
                            {
                                songName: "A really epic song",
                                originalSongName: "A really epic song",
                                hangulSongName: "정말 서사시 노래",
                                originalHangulSongName: "정말 서사시 노래",
                                artistName: "Person2",
                                hangulArtistName: "2인칭",
                                youtubeLink: "abcde",
                                originalLink: null,
                                publishDate: new Date(),
                                members: "female",
                                artistID: 4,
                                isSolo: "y",
                                views: 5,
                                tags: "",
                                vtype: "main",
                                selectionWeight: 1,
                            },
                            5,
                        );

                        assert.deepStrictEqual(
                            gameRound.acceptedArtistAnswers,
                            ["Person2", "2인칭", "Person Two", "Person Too"],
                        );
                    });
                });
            });
        });
    });

    describe("clean song/artist name", () => {
        describe("has uppercase characters", () => {
            it("converts to full lower case", () => {
                assert.strictEqual(
                    normalizePunctuationInName("BLahBLah"),
                    "blahblah",
                );
                assert.strictEqual(cleanArtistName("ClaHClaH"), "clahclah");
            });
        });

        describe("has trailing or leading spaces", () => {
            it("removes the whitespace", () => {
                assert.strictEqual(
                    normalizePunctuationInName("       blahblah          "),
                    "blahblah",
                );

                assert.strictEqual(
                    cleanArtistName("       clahclah          "),
                    "clahclah",
                );
            });
        });

        describe("has unwanted punctuation or symbols", () => {
            it("removes the specified list of removed punctuation", () => {
                assert.strictEqual(
                    normalizePunctuationInName("!bl:ah blah?"),
                    "blahblah",
                );
                assert.strictEqual(cleanArtistName("!cl:ah clah?"), "clahclah");
            });
        });

        describe("has exclusively unwanted punctation or symbols", () => {
            it("does not modify the input", () => {
                assert.strictEqual(normalizePunctuationInName("!? "), "!? ");
            });
        });

        describe("has punctuation to replace", () => {
            it("replaces the punctuation with the correct replacement", () => {
                assert.strictEqual(
                    normalizePunctuationInName("blah & blah"),
                    "blahandblah",
                );

                assert.strictEqual(
                    cleanArtistName("clah & clah"),
                    "clahandclah",
                );
            });
        });

        describe("has brackets in them", () => {
            describe("artist names", () => {
                it("does not ignore the sections in the brackets", () => {
                    assert.strictEqual(
                        cleanArtistName("cla(hclah)"),
                        "clahclah",
                    );
                });
            });
        });
    });

    describe("skipping", () => {
        beforeEach(() => {
            gameRound = new GameRound(
                {
                    songName: "1",
                    originalSongName: "2",
                    hangulSongName: "3",
                    originalHangulSongName: "4",
                    artistName: "5",
                    hangulArtistName: "6",
                    youtubeLink: "7",
                    originalLink: null,
                    publishDate: new Date(2015, 0),
                    members: "coed",
                    artistID: 4,
                    isSolo: "n",
                    views: 123,
                    tags: "",
                    vtype: "main",
                    selectionWeight: 1,
                },
                5,
            );
        });

        describe("unique skippers", () => {
            describe("one person skipping", () => {
                it("should increment the number of skippers by 1", () => {
                    gameRound.userSkipped("user1");
                    assert.strictEqual(gameRound.getSkipCount(), 1);
                });
            });

            describe("3 people skipping", () => {
                it("should increment the number of skippers by 3", () => {
                    gameRound.userSkipped("user1");
                    gameRound.userSkipped("user2");
                    gameRound.userSkipped("user3");
                    assert.strictEqual(gameRound.getSkipCount(), 3);
                });
            });
        });

        describe("duplicate skippers", () => {
            describe("one person skipping twice", () => {
                it("should increment the number of skippers by 1", () => {
                    gameRound.userSkipped("user1");
                    gameRound.userSkipped("user1");
                    assert.strictEqual(gameRound.getSkipCount(), 1);
                });
            });

            describe("2 unique people skipping, total of 3 times", () => {
                it("should increment the number of skippers by 2", () => {
                    gameRound.userSkipped("user1");
                    gameRound.userSkipped("user2");
                    gameRound.userSkipped("user2");
                    assert.strictEqual(gameRound.getSkipCount(), 2);
                });
            });
        });
    });

    describe("check guess", () => {
        beforeEach(() => {
            gameRound = new GameRound(
                {
                    songName: "very cool song",
                    originalSongName: "very cool song",
                    hangulSongName: "매우 시원한 노래",
                    originalHangulSongName: "매우 시원한 노래",
                    artistName: "artist",
                    hangulArtistName: "예술가",
                    youtubeLink: "a1b2c3",
                    originalLink: null,
                    publishDate: new Date(2015, 0),
                    members: "male",
                    artistID: 4,
                    isSolo: "n",
                    views: 3141592653589,
                    tags: "",
                    vtype: "main",
                    selectionWeight: 1,
                },
                5,
            );
        });

        describe("incorrect guess", () => {
            it("should return 0 points", () => {
                assert.strictEqual(
                    gameRound.checkGuess("wrong_song", GuessModeType.SONG_NAME),
                    0,
                );

                assert.strictEqual(
                    gameRound.checkGuess("wrong_artist", GuessModeType.ARTIST),
                    0,
                );

                assert.strictEqual(
                    gameRound.checkGuess("wrong_both", GuessModeType.BOTH),
                    0,
                );
            });
        });

        describe("correct guess", () => {
            describe("hint used", () => {
                it("should return half the amount of points", () => {
                    gameRound.hintUsed = true;
                    assert.strictEqual(
                        gameRound.checkGuess(
                            "very cool song",
                            GuessModeType.SONG_NAME,
                        ),
                        0.5,
                    );
                });
            });

            describe("song guessing mode", () => {
                it("should return 1 point", () => {
                    assert.strictEqual(
                        gameRound.checkGuess(
                            "very cool song",
                            GuessModeType.SONG_NAME,
                        ),
                        1,
                    );
                });
            });

            describe("artist guessing mode", () => {
                it("should return 1 point", () => {
                    assert.strictEqual(
                        gameRound.checkGuess("artist", GuessModeType.ARTIST),
                        1,
                    );
                });
            });

            describe("both guessing mode", () => {
                describe("guessed song", () => {
                    it("should return 1 point", () => {
                        assert.strictEqual(
                            gameRound.checkGuess(
                                "very cool song",
                                GuessModeType.BOTH,
                            ),
                            1,
                        );
                    });
                });

                describe("guessed artist", () => {
                    it("should return 0.2 points", () => {
                        assert.strictEqual(
                            gameRound.checkGuess("artist", GuessModeType.BOTH),
                            0.2,
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
            describe("4 < length <= 6", () => {
                it("should return true", () => {
                    // 1 transposition error (distance = 1)
                    assert.ok(GameRound.similarityCheck("abcde", ["abcde"]));
                    // 1 removal required (distance = 1)
                    assert.ok(GameRound.similarityCheck("abcde", ["abcde"]));
                    // 1 insertion required (distance = 1)
                    assert.ok(GameRound.similarityCheck("abcd", ["abcde"]));
                });
            });

            describe("length > 6", () => {
                it("should return true", () => {
                    // 1 transposition error (distance = 1)
                    assert.ok(
                        GameRound.similarityCheck("abcdegf", ["abcdefg"]),
                    );

                    // 2 transposition errors (distance = 2)
                    assert.ok(
                        GameRound.similarityCheck("bacdegf", ["abcdefg"]),
                    );

                    // 1 removal required (distance = 1)
                    assert.ok(
                        GameRound.similarityCheck("abcdefgh", ["abcdefg"]),
                    );

                    // 1 removal, one transposition error (distance = 2)
                    assert.ok(
                        GameRound.similarityCheck("bacdefgh", ["abcdefg"]),
                    );

                    // 1 insertion required (distance = 1)
                    assert.ok(
                        GameRound.similarityCheck("abcdefg", ["abcdefgh"]),
                    );

                    // 1 insertion required, one transposition error (distance = 2)
                    assert.ok(
                        GameRound.similarityCheck("abcdegf", ["abcdefgh"]),
                    );
                });
            });
        });

        describe("does not meet similarity criteria", () => {
            describe("length <= 4, all should fail", () => {
                it("should return false", () => {
                    assert.ok(!GameRound.similarityCheck("a", ["a"]));
                    assert.ok(!GameRound.similarityCheck("bb", ["bb"]));
                    assert.ok(!GameRound.similarityCheck("ccc", ["cccc"]));
                    assert.ok(!GameRound.similarityCheck("dddd", ["dddd"]));
                });
            });

            describe("4 < length <= 6, edit distance of 1 allowed", () => {
                it("should return false", () => {
                    // 2 transposition errors (distance = 2)
                    assert.ok(!GameRound.similarityCheck("baced", ["abcde"]));
                    // 2 removal required (distance = 2)
                    assert.ok(!GameRound.similarityCheck("abcdefg", ["abcde"]));
                    // 2 insertion required (distance = 2)
                    assert.ok(!GameRound.similarityCheck("abc", ["abcde"]));
                    // 1 removal, one transposition error (distance = 2)
                    assert.ok(!GameRound.similarityCheck("bacdef", ["abcde"]));
                    // 1 insertion required, one transposition error (distance = 2)
                    assert.ok(!GameRound.similarityCheck("bacde", ["abcdef"]));
                });
            });

            describe("length > 6, edit distance of 2 allowed && max 2 insert/removals", () => {
                it("should return false", () => {
                    // 3 transposition errors (distance = 3)
                    assert.ok(
                        !GameRound.similarityCheck("badcegf", ["abcdefg"]),
                    );

                    // 2 removals required (2 removals not allowed)
                    assert.ok(
                        !GameRound.similarityCheck("abcdefghi", ["abcdefg"]),
                    );

                    // 2 insertions required (2 insertions not allowed)
                    assert.ok(
                        !GameRound.similarityCheck("abcdefg", ["abcdefghi"]),
                    );

                    // 1 removal, 2 transposition error (distance = 3)
                    assert.ok(
                        !GameRound.similarityCheck("badcefgh", ["abcdefg"]),
                    );

                    // 1 insertion, 2 transposition error (distance = 3)
                    assert.ok(
                        !GameRound.similarityCheck("badcef", ["abcdefg"]),
                    );

                    // 1 insertion, 1 removal, 1 transposition error (distance = 3)
                    assert.ok(
                        !GameRound.similarityCheck("bacdegh", ["abcdefg"]),
                    );
                });
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
                        ]),
                    );
                });
            });

            describe("at least one choice meets criteria", () => {
                it("should return true", () => {
                    // 1 transposition error
                    assert.ok(
                        GameRound.similarityCheck("abcdegf", [
                            "1234567",
                            "abcdefg",
                            "5454544545",
                        ]),
                    );

                    // 2 transposition errors
                    assert.ok(
                        GameRound.similarityCheck("bacdegf", [
                            "1234567",
                            "abcdefg",
                            "5454544545",
                        ]),
                    );

                    // 1 removal required
                    assert.ok(
                        GameRound.similarityCheck("abcdefgh", [
                            "1234567",
                            "abcdefg",
                            "5454544545",
                        ]),
                    );

                    // 1 removal, one transposition error
                    assert.ok(
                        GameRound.similarityCheck("bacdefgh", [
                            "1234567",
                            "abcdefg",
                            "5454544545",
                        ]),
                    );

                    // 1 insertion required
                    assert.ok(
                        GameRound.similarityCheck("abcdef", [
                            "1234567",
                            "abcdefg",
                            "5454544545",
                        ]),
                    );

                    // 1 insertion required, one transposition error
                    assert.ok(
                        GameRound.similarityCheck("bacdef", [
                            "1234567",
                            "abcdefg",
                            "5454544545",
                        ]),
                    );
                });
            });
        });
    });

    describe("getExpReward", () => {
        const exp = 500;
        beforeEach(() => {
            gameRound = new GameRound(
                {
                    songName: "very cool song",
                    originalSongName: "very cool song",
                    hangulSongName: "매우 시원한 노래",
                    originalHangulSongName: "매우 시원한 노래",
                    artistName: "artist",
                    hangulArtistName: "예술가",
                    youtubeLink: "a1b2c3",
                    originalLink: null,
                    publishDate: new Date(2015),
                    members: "female",
                    artistID: 4,
                    isSolo: "y",
                    views: 246810121416,
                    tags: "",
                    vtype: "main",
                    selectionWeight: 1,
                },
                5,
            );
        });

        describe("no hint used", () => {
            it("should return the same amount of exp", () => {
                gameRound.setBaseExpReward(exp);
                assert.strictEqual(gameRound.getExpReward(), exp);
            });
        });

        describe("hint used", () => {
            it("should apply the appropriate penalty", () => {
                gameRound.setBaseExpReward(exp);
                gameRound.hintUsed = true;
                assert.strictEqual(
                    gameRound.getExpReward(),
                    exp * ExpBonusModifierValues[ExpBonusModifier.HINT_USED],
                );
            });
        });

        describe("typo allowed", () => {
            it("should apply the appropriate penalty", () => {
                gameRound.setBaseExpReward(exp);
                assert.strictEqual(
                    gameRound.getExpReward(true),
                    exp * ExpBonusModifierValues[ExpBonusModifier.TYPO],
                );
            });
        });
    });

    describe("storeGuess", () => {
        beforeEach(() => {
            gameRound = new GameRound(
                {
                    songName: "dalla dalla",
                    originalSongName: "dalla dalla",
                    hangulSongName: "매우 시원한 노래",
                    originalHangulSongName: "매우 시원한 노래",
                    artistName: "artist",
                    hangulArtistName: "예술가",
                    youtubeLink: "a1b2c3",
                    originalLink: null,
                    publishDate: new Date(2015, 0),
                    members: "male",
                    artistID: 4,
                    isSolo: "n",
                    views: 3141592653589,
                    tags: "",
                    vtype: "main",
                    selectionWeight: 1,
                },
                5,
            );

            gameRound.songStartedAt = gameRound.startedAt + 500;
        });

        it("should keep track of a player's first guess", () => {
            const guess = "dalla dalla";
            const playerID = "123";
            const createdAt = gameRound.songStartedAt! + 1000;
            const guessModeType = GuessModeType.SONG_NAME;
            const typosAllowed = false;
            gameRound.storeGuess(
                playerID,
                guess,
                createdAt,
                guessModeType,
                typosAllowed,
            );

            assert.deepStrictEqual(gameRound.getGuesses(), {
                [playerID]: [
                    {
                        timeToGuessMs: createdAt - gameRound.songStartedAt!,
                        guess,
                        correct: true,
                    },
                ],
            });
            assert.strictEqual(gameRound.correctGuessers.length, 1);
            assert.strictEqual(gameRound.incorrectGuessers.size, 0);
            assert.strictEqual(gameRound.correctGuessers[0].id, playerID);
        });

        it("should allow users to overwrite their guesses", async () => {
            const guessModeType = GuessModeType.SONG_NAME;
            const typosAllowed = false;
            const playerID = "123";

            const firstGuessCreatedAt = gameRound.songStartedAt! + 1000;
            const firstGuess = "icy";
            gameRound.storeGuess(
                playerID,
                firstGuess,
                firstGuessCreatedAt,
                guessModeType,
                typosAllowed,
            );

            assert.deepStrictEqual(gameRound.getGuesses(), {
                [playerID]: [
                    {
                        timeToGuessMs:
                            firstGuessCreatedAt - gameRound.songStartedAt!,
                        guess: firstGuess,
                        correct: false,
                    },
                ],
            });
            assert.strictEqual(gameRound.correctGuessers.length, 0);
            assert.strictEqual(gameRound.incorrectGuessers.size, 1);
            await delay(10);

            const secondGuess = "dalla dalla";
            const secondGuessCreatedAt = gameRound.songStartedAt! + 2000;

            gameRound.storeGuess(
                playerID,
                secondGuess,
                secondGuessCreatedAt,
                guessModeType,
                typosAllowed,
            );

            assert.deepStrictEqual(gameRound.getGuesses(), {
                [playerID]: [
                    {
                        timeToGuessMs:
                            firstGuessCreatedAt - gameRound.songStartedAt!,
                        guess: firstGuess,
                        correct: false,
                    },
                    {
                        timeToGuessMs:
                            secondGuessCreatedAt - gameRound.songStartedAt!,
                        guess: secondGuess,
                        correct: true,
                    },
                ],
            });
            assert.strictEqual(gameRound.correctGuessers.length, 1);
            assert.strictEqual(gameRound.incorrectGuessers.size, 0);
            assert.strictEqual(gameRound.correctGuessers[0].id, playerID);
        });
    });
});
