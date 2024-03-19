/* eslint-disable @typescript-eslint/dot-notation */
import { ExpBonusModifierValues } from "../../constants";
import { delay } from "../../helpers/utils";
import ExpBonusModifier from "../../enums/exp_bonus_modifier";
import GameRound from "../../structures/game_round";
import GuessModeType from "../../enums/option_types/guess_mode_type";
import QueriedSong from "../../structures/queried_song";
import State from "../../state";
import assert from "assert";

describe("game round", () => {
    let gameRound: GameRound;
    describe("checkGuess", () => {
        describe("artist/song names without aliases", () => {
            it("adds the corresponding name as a correct answer", () => {
                gameRound = new GameRound(
                    new QueriedSong({
                        songName: "Song1",
                        hangulSongName: "노래1",
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
                    }),
                    5,
                );

                assert.ok(gameRound.checkGuess("Jisoo", GuessModeType.ARTIST));
                assert.ok(gameRound.checkGuess("지수", GuessModeType.ARTIST));
                assert.ok(
                    gameRound.checkGuess("Song1", GuessModeType.SONG_NAME),
                );

                assert.ok(
                    gameRound.checkGuess("노래1", GuessModeType.SONG_NAME),
                );

                // invalid options
                assert.ok(
                    !gameRound.checkGuess(
                        "fakeartistname",
                        GuessModeType.ARTIST,
                    ),
                );

                assert.ok(
                    !gameRound.checkGuess(
                        "fakesongname",
                        GuessModeType.SONG_NAME,
                    ),
                );
            });
        });

        describe("artist collabs", () => {
            it("should record them as two separate artists", () => {
                gameRound = new GameRound(
                    new QueriedSong({
                        songName: "Poggers Song",
                        hangulSongName: "리그마 포트나이트",
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
                    }),
                    5,
                );

                assert.ok(gameRound.checkGuess("IU", GuessModeType.ARTIST));
                assert.ok(
                    gameRound.checkGuess("Blackpink", GuessModeType.ARTIST),
                );
                assert.ok(gameRound.checkGuess("아이유", GuessModeType.ARTIST));
                assert.ok(
                    gameRound.checkGuess("블랙핑크", GuessModeType.ARTIST),
                );
            });
        });

        describe("artist name has a bracket (indicating alternative name)", () => {
            it("should add the alternative name as an accepted artist name", () => {
                gameRound = new GameRound(
                    new QueriedSong({
                        songName: "Good Girls in the Dark",
                        hangulSongName: "상사병에 걸린 소녀들",
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
                    }),
                    5,
                );

                assert.ok(gameRound.checkGuess("Yena", GuessModeType.ARTIST));
                assert.ok(
                    gameRound.checkGuess("Choi Yena", GuessModeType.ARTIST),
                );
                assert.ok(gameRound.checkGuess("최예나", GuessModeType.ARTIST));
                assert.ok(gameRound.checkGuess("나", GuessModeType.ARTIST));
            });
        });

        describe("artist name has trailing or leading spaces", () => {
            it("should remove them", () => {
                gameRound = new GameRound(
                    new QueriedSong({
                        songName: "Lovesick Girls",
                        hangulSongName: "상사병에 걸린 소녀들",
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
                    }),
                    5,
                );

                assert.ok(
                    gameRound.checkGuess("Blackpink", GuessModeType.ARTIST),
                );
                assert.ok(gameRound.checkGuess("IU", GuessModeType.ARTIST));
                assert.ok(
                    gameRound.checkGuess("블랙핑크", GuessModeType.ARTIST),
                );
                assert.ok(gameRound.checkGuess("아이유", GuessModeType.ARTIST));
            });
        });

        describe("names contains unwanted characters", () => {
            it("should remove the unwanted characters", () => {
                gameRound = new GameRound(
                    new QueriedSong({
                        songName: "Sev en  !",
                        hangulSongName: "금  !요",
                        artistName: "Jung  kook",
                        hangulArtistName: "정  국",
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
                    }),
                    5,
                );

                assert.ok(
                    gameRound.checkGuess("Seven", GuessModeType.SONG_NAME),
                );

                assert.ok(
                    gameRound.checkGuess("Seve n", GuessModeType.SONG_NAME),
                );

                assert.ok(
                    gameRound.checkGuess(
                        "금  !      요",
                        GuessModeType.SONG_NAME,
                    ),
                );

                assert.ok(
                    gameRound.checkGuess("금요", GuessModeType.SONG_NAME),
                );

                assert.ok(
                    gameRound.checkGuess("Jungkook", GuessModeType.ARTIST),
                );

                assert.ok(
                    gameRound.checkGuess("Jung kook", GuessModeType.ARTIST),
                );

                assert.ok(gameRound.checkGuess("정국", GuessModeType.ARTIST));
                assert.ok(gameRound.checkGuess("정 국", GuessModeType.ARTIST));
            });
        });

        describe("song name is solely unwanted characters", () => {
            it("should not clean the song name", () => {
                gameRound = new GameRound(
                    new QueriedSong({
                        songName: "?!",
                        hangulSongName: "@#",
                        artistName: "a",
                        hangulArtistName: "a",
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
                    }),
                    5,
                );

                assert.ok(gameRound.checkGuess("?!", GuessModeType.SONG_NAME));
                assert.ok(gameRound.checkGuess("@#", GuessModeType.SONG_NAME));
                assert.ok(!gameRound.checkGuess("", GuessModeType.SONG_NAME));
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
                            new QueriedSong({
                                songName: "A really epic song",
                                hangulSongName: "정말 서사시 노래",
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
                            }),
                            5,
                        );

                        assert.ok(
                            gameRound.checkGuess(
                                "A really epic song",
                                GuessModeType.SONG_NAME,
                            ),
                        );

                        assert.ok(
                            gameRound.checkGuess(
                                "An epic song",
                                GuessModeType.SONG_NAME,
                            ),
                        );

                        assert.ok(
                            gameRound.checkGuess(
                                "A good song",
                                GuessModeType.SONG_NAME,
                            ),
                        );

                        assert.ok(
                            gameRound.checkGuess(
                                "정말 서사시 노래",
                                GuessModeType.SONG_NAME,
                            ),
                        );
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
                            new QueriedSong({
                                songName: "A really epic song",
                                hangulSongName: "정말 서사시 노래",
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
                            }),
                            5,
                        );

                        assert.ok(
                            gameRound.checkGuess(
                                "Person2",
                                GuessModeType.ARTIST,
                            ),
                        );

                        assert.ok(
                            gameRound.checkGuess("2인칭", GuessModeType.ARTIST),
                        );

                        assert.ok(
                            gameRound.checkGuess(
                                "Person Two",
                                GuessModeType.ARTIST,
                            ),
                        );

                        assert.ok(
                            gameRound.checkGuess(
                                "Person Too",
                                GuessModeType.ARTIST,
                            ),
                        );
                    });
                });
            });
        });

        describe("typos", () => {
            it("should allow typos if enabled", () => {
                gameRound = new GameRound(
                    new QueriedSong({
                        songName: "Perfect Night",
                        hangulSongName: "Perfect Night",
                        artistName: "Le Sserafim",
                        hangulArtistName: "르세라핌",
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
                    }),
                    5,
                );

                assert.ok(
                    !gameRound.checkGuess(
                        "Perfect Hight",
                        GuessModeType.SONG_NAME,
                        false,
                    ),
                );

                assert.ok(
                    gameRound.checkGuess(
                        "Perfect Hight",
                        GuessModeType.SONG_NAME,
                        true,
                    ),
                );

                assert.ok(
                    !gameRound.checkGuess(
                        "Le SserafiN",
                        GuessModeType.ARTIST,
                        false,
                    ),
                );

                assert.ok(
                    gameRound.checkGuess(
                        "Le SserafiN",
                        GuessModeType.ARTIST,
                        true,
                    ),
                );
            });
        });
    });

    describe("skipping", () => {
        beforeEach(() => {
            gameRound = new GameRound(
                new QueriedSong({
                    songName: "1",
                    hangulSongName: "3",
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
                }),
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

    describe("check guess points", () => {
        beforeEach(() => {
            gameRound = new GameRound(
                new QueriedSong({
                    songName: "very cool song",
                    hangulSongName: "매우 시원한 노래",
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
                }),
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
                new QueriedSong({
                    songName: "very cool song",
                    hangulSongName: "매우 시원한 노래",
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
                }),
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
                new QueriedSong({
                    songName: "dalla dalla",
                    hangulSongName: "매우 시원한 노래",
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
                }),
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
            assert.strictEqual(gameRound.correctGuessers[0]!.id, playerID);
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
            assert.strictEqual(gameRound.correctGuessers[0]!.id, playerID);
        });
    });
});
