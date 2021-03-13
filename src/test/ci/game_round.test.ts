/* eslint-disable @typescript-eslint/dot-notation */
/* eslint-disable prefer-arrow-callback */
import assert from "assert";
import { ModeType } from "../../commands/game_options/mode";
import state from "../../kmq";
import GameRound, { cleanArtistName, cleanSongName } from "../../structures/game_round";

let gameRound: GameRound;
describe("constructor defaults", function () {
    describe("artist/song names without aliases", function () {
        it("adds the corresponding name as a correct answer", function () {
            gameRound = new GameRound("Song1", "Jisoo", "abcde", 2021);
            assert.deepStrictEqual(gameRound.acceptedArtistAnswers, ["Jisoo"]);
            assert.deepStrictEqual(gameRound.acceptedSongAnswers, ["Song1"]);
        });
    });
    describe("artist collabs", function () {
        it("should record them as two separate artists", () => {
            gameRound = new GameRound("Poggers Song", "IU + Blackpink", "abcde", 2021);
            assert.deepStrictEqual(gameRound.acceptedArtistAnswers, ["IU", "Blackpink"]);
        });
    });

    describe("artist name has trailing or leading spaces", function () {
        it("should remove them", function () {
            gameRound = new GameRound("Lovesick Girls", " Blackpink + IU             ", "abcde", 2021);
            assert.deepStrictEqual(gameRound.acceptedArtistAnswers, ["Blackpink", "IU"]);
        });
    });

    describe("aliases", function () {
        beforeEach(function () {
            state.aliases.artist = {};
            state.aliases.song = {};
        });
        describe("song aliases", function () {
            describe("song has an alias", function () {
                it("records the aliases as an accepted answer", function () {
                    state.aliases.song["abcde"] = ["An epic song", "A good song"];
                    gameRound = new GameRound("A really epic song", "A really epic person", "abcde", 2021);
                    assert.deepStrictEqual(gameRound.acceptedSongAnswers, ["A really epic song", "An epic song", "A good song"]);
                });
            });
        });
        describe("artist aliases", function () {
            describe("artist has an alias", function () {
                it("records the aliases as an accepted answer", function () {
                    state.aliases.artist["Person2"] = ["Person Two", "Person Too"];
                    gameRound = new GameRound("A really epic song", "Person2", "abcde", 2021);
                    assert.deepStrictEqual(gameRound.acceptedArtistAnswers, ["Person2", "Person Two", "Person Too"]);
                });
            });
        });
    });
});

describe("clean song/artist name", function () {
    describe("has uppercase characters", function () {
        it("converts to full lower case", () => {
            assert.strictEqual(cleanSongName("BLahBLah"), "blahblah");
            assert.strictEqual(cleanArtistName("ClaHClaH"), "clahclah");
        });
    });
    describe("has trailing or leading spaces", function () {
        it("removes the whitespace", () => {
            assert.strictEqual(cleanSongName("       blahblah          "), "blahblah");
            assert.strictEqual(cleanArtistName("       clahclah          "), "clahclah");
        });
    });

    describe("has unwanted punctuation or symbols", function () {
        it("removes the specified list of removed punctuation", () => {
            assert.strictEqual(cleanSongName("!bl:ah blah?"), "blahblah");
            assert.strictEqual(cleanArtistName("!cl:ah clah?"), "clahclah");
        });
    });
    describe("has punctuation to replace", function () {
        it("replaces the punctuation with the correct replacement", () => {
            assert.strictEqual(cleanSongName("blah & blah"), "blahandblah");
            assert.strictEqual(cleanArtistName("clah & clah"), "clahandclah");
        });
    });
    describe("has brackets in them", function () {
        describe("song names", function () {
            it("removes the sections in the brackets", function () {
                assert.strictEqual(cleanSongName("blahblah (123)"), "blahblah");
            });
        });
        describe("artist names", function () {
            it("does not ignore the sections in the brackets", function () {
                assert.strictEqual(cleanArtistName("cla(hclah)"), "clahclah");
            });
        });
    });
});

describe("skipping", function () {
    beforeEach(function () {
        gameRound = new GameRound("1", "2", "3", 2015);
    });

    describe("unique skippers", function () {
        describe("one person skipping", () => {
            it("should increment the number of skippers by 1", function () {
                gameRound.userSkipped("user1");
                assert.strictEqual(gameRound.getNumSkippers(), 1);
            });
        });
        describe("3 people skipping", function () {
            it("should increment the number of skippers by 3", function () {
                gameRound.userSkipped("user1");
                gameRound.userSkipped("user2");
                gameRound.userSkipped("user3");
                assert.strictEqual(gameRound.getNumSkippers(), 3);
            });
        });
    });

    describe("duplicate skippers", function () {
        describe("one person skipping twice", () => {
            it("should increment the number of skippers by 1", function () {
                gameRound.userSkipped("user1");
                gameRound.userSkipped("user1");
                assert.strictEqual(gameRound.getNumSkippers(), 1);
            });
        });
        describe("2 unique people skipping, total of 3 times", function () {
            it("should increment the number of skippers by 2", function () {
                gameRound.userSkipped("user1");
                gameRound.userSkipped("user2");
                gameRound.userSkipped("user2");
                assert.strictEqual(gameRound.getNumSkippers(), 2);
            });
        });
    });
});

describe("check guess", () => {
    beforeEach(function () {
        gameRound = new GameRound("song", "artist", "a1b2c3", 2015);
    });
    describe("incorrect guess", function () {
        it("should return 0 points", function () {
            assert.strictEqual(gameRound.checkGuess("wrong_song", ModeType.SONG_NAME), 0);
            assert.strictEqual(gameRound.checkGuess("wrong_artist", ModeType.ARTIST), 0);
            assert.strictEqual(gameRound.checkGuess("wrong_both", ModeType.BOTH), 0);
        });
    });
    describe("correct guess", function () {
        describe("song guessing mode", function () {
            it("should return 1 point", function () {
                assert.strictEqual(gameRound.checkGuess("song", ModeType.SONG_NAME), 1);
            });
        });
        describe("artist guessing mode", function () {
            it("should return 1 point", function () {
                assert.strictEqual(gameRound.checkGuess("artist", ModeType.ARTIST), 1);
            });
        });
        describe("both guessing mode", function () {
            describe("guessed song", function () {
                it("should return 1 point", function () {
                    assert.strictEqual(gameRound.checkGuess("song", ModeType.BOTH), 1);
                });
            });
            describe("guessed artist", function () {
                it("should return 0.2 points", function () {
                    assert.strictEqual(gameRound.checkGuess("artist", ModeType.BOTH), 0.2);
                });
            });
        });
    });
});
