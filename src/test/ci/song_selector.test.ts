import assert from "assert";
import sinon from "sinon";
import { Gender } from "../../commands/game_options/gender";
import { OstPreference } from "../../commands/game_options/ost";
import { ReleaseType } from "../../commands/game_options/release";
import { SubunitsPreference } from "../../commands/game_options/subunits";
import GuildPreference from "../../structures/guild_preference";
import SongSelector, {
    LAST_PLAYED_SONG_QUEUE_SIZE,
} from "../../structures/song_selector";
import _ from "lodash";
import { ArtistType } from "../../commands/game_options/artisttype";
import { getMatchingGroupNames } from "../../helpers/game_utils";
import {
    FOREIGN_LANGUAGE_TAGS,
    LanguageType,
} from "../../commands/game_options/language";
import { ShuffleType } from "../../commands/game_options/shuffle";
import QueriedSong from "../../interfaces/queried_song";

async function getMockGuildPreference(): Promise<GuildPreference> {
    const guildPreference = new GuildPreference("test");
    sinon.stub(guildPreference, "updateGuildPreferences");
    await guildPreference.setSubunitPreference(SubunitsPreference.EXCLUDE);
    await guildPreference.setLimit(0, 99999);
    await guildPreference.setOstPreference(OstPreference.INCLUDE);
    await guildPreference.setReleaseType(ReleaseType.ALL);
    return guildPreference;
}

let guildPreference: GuildPreference;
beforeEach(async () => {
    guildPreference = await getMockGuildPreference();
});

describe("getFilteredSongList", () => {
    describe("gender game option", () => {
        describe("single-select gender", () => {
            it("should only return the songs matching the specified gender", async () => {
                for (const gender of [
                    Gender.MALE,
                    Gender.FEMALE,
                    Gender.COED,
                ]) {
                    await guildPreference.setGender([gender]);
                    const { songs } = await SongSelector.getFilteredSongList(
                        guildPreference,
                        true
                    );

                    assert.strictEqual(
                        Array.from(songs).every(
                            (song) => song.members === gender
                        ),
                        true,
                        `Gender query (${gender}) does not match with actual gender count`
                    );
                }
            });
        });

        describe("multi-select gender", () => {
            it("should only return the songs matching the specified genders", async () => {
                const genderSetting = [Gender.MALE, Gender.FEMALE];
                await guildPreference.setGender(genderSetting);
                const { songs } = await SongSelector.getFilteredSongList(
                    guildPreference,
                    true
                );

                assert.strictEqual(
                    Array.from(songs).every((song) =>
                        [Gender.MALE, Gender.FEMALE].includes(song.members)
                    ),
                    true
                );
            });
        });
    });

    describe("groups", () => {
        beforeEach(async () => {
            await guildPreference.setGender([Gender.ALTERNATING]);
        });

        describe("single-selected group", () => {
            it("should only return the songs matching the specified group", async () => {
                const selectedArtist = { id: 208, name: "Twice" };
                await guildPreference.setGroups([selectedArtist]);
                const { songs } = await SongSelector.getFilteredSongList(
                    guildPreference,
                    true
                );

                assert.strictEqual(
                    Array.from(songs).every(
                        (song) => song.artistID === selectedArtist.id
                    ),
                    true
                );
            });
        });

        describe("multi-selected groups", () => {
            it("should only return the songs matching the specified groups", async () => {
                const selectedArtists = [
                    { id: 208, name: "Twice" },
                    { id: 40, name: "BTS" },
                    { id: 61, name: "EXO" },
                ];

                await guildPreference.setGroups(selectedArtists);
                const { songs } = await SongSelector.getFilteredSongList(
                    guildPreference,
                    true
                );

                assert.strictEqual(
                    Array.from(songs).every((song) =>
                        selectedArtists.map((x) => x.id).includes(song.artistID)
                    ),
                    true
                );
            });
        });
    });

    describe("includes", () => {
        const includedArtists = [
            { id: 208, name: "Twice" },
            { id: 40, name: "BTS" },
            { id: 61, name: "EXO" },
        ];

        describe("female gender, include 2 male groups", () => {
            it("should only return the songs matching the specified gender, and the explicitly included artists", async () => {
                await guildPreference.setGender([Gender.FEMALE]);
                await guildPreference.setIncludes(includedArtists);
                const { songs } = await SongSelector.getFilteredSongList(
                    guildPreference,
                    true
                );

                assert.strictEqual(
                    Array.from(songs).every(
                        (song) =>
                            song.members === Gender.FEMALE ||
                            includedArtists
                                .map((x) => x.id)
                                .includes(song.artistID)
                    ),
                    true
                );
            });
        });
    });

    describe("excludes", () => {
        const excludeArtists = [
            { id: 208, name: "Twice" },
            { id: 31, name: "Blackpink" },
        ];

        describe("female gender, exclude 2 female groups", () => {
            it("should only return the songs matching the specified gender, explicitly excluding excluded artists ", async () => {
                await guildPreference.setGender([Gender.FEMALE]);
                await guildPreference.setExcludes(excludeArtists);
                const { songs } = await SongSelector.getFilteredSongList(
                    guildPreference,
                    true
                );

                assert.strictEqual(
                    Array.from(songs).every(
                        (song) =>
                            song.members === Gender.FEMALE &&
                            excludeArtists
                                .map((x) => x.id)
                                .every((x) => x !== song.artistID)
                    ),
                    true
                );
            });
        });
    });

    describe("artist type", () => {
        describe("soloists", () => {
            it("should only return the songs by soloists", async () => {
                await guildPreference.setArtistType(ArtistType.SOLOIST);
                const { songs } = await SongSelector.getFilteredSongList(
                    guildPreference,
                    true
                );

                assert.strictEqual(
                    Array.from(songs).every((song) => song.isSolo === "y"),
                    true
                );
            });
        });

        describe("groups", () => {
            it("should only return the songs by groups", async () => {
                await guildPreference.setArtistType(ArtistType.GROUP);
                const { songs } = await SongSelector.getFilteredSongList(
                    guildPreference,
                    true
                );

                assert.strictEqual(
                    Array.from(songs).every((song) => song.isSolo === "n"),
                    true
                );
            });
        });
    });

    describe("cutoff", () => {
        describe("songs in or after 2016", () => {
            it("should only return the songs published in or after 2016", async () => {
                await guildPreference.setBeginningCutoffYear(2016);
                const { songs } = await SongSelector.getFilteredSongList(
                    guildPreference,
                    true
                );

                assert.strictEqual(
                    Array.from(songs).every(
                        (song) => song.publishDate >= new Date("2016-01-01")
                    ),
                    true
                );
            });
        });

        describe("songs in or before 2015", () => {
            it("should only return the songs published in or before 2015", async () => {
                await guildPreference.setEndCutoffYear(2015);
                const { songs } = await SongSelector.getFilteredSongList(
                    guildPreference,
                    true
                );

                assert.strictEqual(
                    Array.from(songs).every(
                        (song) => song.publishDate < new Date("2016-01-01")
                    ),
                    true
                );
            });
        });

        describe("songs between 2008 and 2018", () => {
            it("should only return the songs published between 2008 and 2018", async () => {
                await guildPreference.setBeginningCutoffYear(2008);
                await guildPreference.setEndCutoffYear(2018);
                const { songs } = await SongSelector.getFilteredSongList(
                    guildPreference,
                    true
                );

                assert.strictEqual(
                    Array.from(songs).every(
                        (song) =>
                            song.publishDate >= new Date("2008-01-01") &&
                            song.publishDate < new Date("2019-01-01")
                    ),
                    true
                );
            });
        });

        describe("songs in 2017", () => {
            it("sshould only return the songs published in 2017", async () => {
                await guildPreference.setBeginningCutoffYear(2017);
                await guildPreference.setEndCutoffYear(2017);
                const { songs } = await SongSelector.getFilteredSongList(
                    guildPreference,
                    true
                );

                assert.strictEqual(
                    Array.from(songs).every(
                        (song) =>
                            song.publishDate >= new Date("2017-01-01") &&
                            song.publishDate < new Date("2018-01-01")
                    ),
                    true
                );
            });
        });
    });

    describe("shuffle mode song weights", () => {
        beforeEach(async () => {
            await guildPreference.setLimit(0, 100);
        });

        describe("random shuffle mode", () => {
            it("should have all songs with equal weight", async () => {
                const { songs } = await SongSelector.getFilteredSongList(
                    guildPreference,
                    true
                );

                assert.ok(
                    Array.from(songs).every(
                        (song) => song.selectionWeight === 1
                    )
                );
            });
        });

        describe("weighted shuffle mode", () => {
            describe("weighted easy", () => {
                it("should have decreasing weight values", async () => {
                    await guildPreference.setShuffleType(
                        ShuffleType.WEIGHTED_EASY
                    );
                    const { songs } = await SongSelector.getFilteredSongList(
                        guildPreference,
                        true
                    );

                    const songsArray = Array.from(songs);
                    assert.ok(
                        songsArray[0].selectionWeight >
                            songsArray[songsArray.length - 1].selectionWeight
                    );

                    for (let i = 1; i < songsArray.length - 1; i++) {
                        assert.ok(
                            songsArray[i - 1].selectionWeight >=
                                songsArray[i].selectionWeight
                        );
                    }
                });
            });

            describe("weighted hard", () => {
                it("should have increasing weight values", async () => {
                    await guildPreference.setShuffleType(
                        ShuffleType.WEIGHTED_HARD
                    );
                    const { songs } = await SongSelector.getFilteredSongList(
                        guildPreference,
                        true
                    );

                    const songsArray = Array.from(songs);
                    assert.ok(
                        songsArray[0].selectionWeight <
                            songsArray[songsArray.length - 1].selectionWeight
                    );

                    for (let i = 1; i < songsArray.length - 1; i++) {
                        assert.ok(
                            songsArray[i - 1].selectionWeight <=
                                songsArray[i].selectionWeight
                        );
                    }
                });
            });
        });
    });
});

describe("subunits", () => {
    const artists = [{ id: 16, name: "AOA" }];

    describe("exclude subunits", () => {
        it("should only return the songs by the specified group, excluding subunits", async () => {
            await guildPreference.setGroups(artists);
            await guildPreference.setSubunitPreference(
                SubunitsPreference.EXCLUDE
            );
            const { songs } = await SongSelector.getFilteredSongList(
                guildPreference,
                true
            );

            assert.strictEqual(
                Array.from(songs).every(
                    (song) => song.artistID === artists[0].id
                ),
                true
            );
        });
    });

    describe("include subunits", () => {
        it("should only return the songs by the specified group, including subunits", async () => {
            await guildPreference.setGroups(artists);
            await guildPreference.setSubunitPreference(
                SubunitsPreference.INCLUDE
            );

            const { songs } = await SongSelector.getFilteredSongList(
                guildPreference,
                true
            );

            const expectedSubunitIds = [17, 43, 105, 248];

            // all songs must be one of the artist, or the subunit's
            assert.strictEqual(
                Array.from(songs).every((song) =>
                    [...expectedSubunitIds, artists[0].id].includes(
                        song.artistID
                    )
                ),
                true
            );

            // should have song from each one of the expected artists/subunits
            assert.strictEqual(
                new Set(Array.from(songs).map((song) => song.artistID)).size ===
                    expectedSubunitIds.length + 1,
                true
            );
        });
    });

    describe("include subunits (and the subunit has a collab)", () => {
        it("should match the songs from the group, collabs of that group, and collabs of any subunits of that group", async () => {
            const artistWithCollabingSubunit = { name: "BIGBANG", id: 28 };
            const subunitWithCollab = { name: "G-DRAGON", id: 68 };
            const subunitCollabArtist = { name: "G-DRAGON + TAEYANG", id: 73 };
            const parentCollabArtist = { name: "BIGBANG + 2NE1", id: 29 };

            const expectedIds = [
                artistWithCollabingSubunit.id,
                subunitWithCollab.id,
                subunitCollabArtist.id,
                parentCollabArtist.id,
            ];

            const { matchedGroups, unmatchedGroups } =
                await getMatchingGroupNames([artistWithCollabingSubunit.name]);

            await guildPreference.setGroups(matchedGroups);
            await guildPreference.setSubunitPreference(
                SubunitsPreference.INCLUDE
            );

            const { songs } = await SongSelector.getFilteredSongList(
                guildPreference,
                true
            );

            assert.strictEqual(unmatchedGroups.length, 0);

            assert.strictEqual(
                expectedIds.every((artistId) => {
                    return Array.from(songs).some(
                        (song) => song.artistID === artistId
                    );
                }),
                true
            );
        });
    });

    describe("OSTs", () => {
        describe("exclude OSTs", () => {
            it("should only return songs, not including OSTs", async () => {
                await guildPreference.setOstPreference(OstPreference.EXCLUDE);
                const { songs } = await SongSelector.getFilteredSongList(
                    guildPreference,
                    true
                );

                assert.strictEqual(
                    Array.from(songs).every((song) => !song.tags.includes("o")),
                    true
                );
            });
        });

        describe("include OSTs", () => {
            it("should only return songs including OSTs", async () => {
                await guildPreference.setOstPreference(OstPreference.INCLUDE);
                const { songs } = await SongSelector.getFilteredSongList(
                    guildPreference,
                    true
                );

                // should have both non osts and osts
                assert.strictEqual(
                    Array.from(songs).filter((song) => song.tags.includes("o"))
                        .length > 0 &&
                        Array.from(songs).filter(
                            (song) => !song.tags.includes("o")
                        ).length > 0,
                    true
                );
            });
        });

        describe("exclusive OSTs", () => {
            it("should only return songs which are exclusively OSTs", async () => {
                await guildPreference.setOstPreference(OstPreference.EXCLUSIVE);
                const { songs } = await SongSelector.getFilteredSongList(
                    guildPreference,
                    true
                );

                assert.strictEqual(
                    Array.from(songs).every((song) => song.tags.includes("o")),
                    true
                );
            });
        });
    });

    describe("limit", () => {
        const limit = 17;
        beforeEach(async () => {
            await guildPreference.setGender([Gender.COED]);
        });

        describe("with limit", () => {
            it("should only return the top [x] number of songs", async () => {
                const expectedSongCount = limit;
                await guildPreference.setLimit(0, limit);
                const { songs } = await SongSelector.getFilteredSongList(
                    guildPreference,
                    true
                );

                assert.strictEqual(songs.size, expectedSongCount);
            });
        });
    });

    describe("language", () => {
        describe("language is set to korean only", () => {
            it("should only return the korean songs", async () => {
                await guildPreference.setLanguageType(LanguageType.KOREAN);
                const { songs } = await SongSelector.getFilteredSongList(
                    guildPreference,
                    true
                );

                // there are no songs with language tags
                assert.strictEqual(
                    Array.from(songs).every(
                        (song) =>
                            _.intersection(
                                song.tags.split(""),
                                FOREIGN_LANGUAGE_TAGS
                            ).length === 0
                    ),
                    true
                );
            });
        });

        describe("language is set to all", () => {
            it("should return all songs regardless of language", async () => {
                await guildPreference.setLanguageType(LanguageType.ALL);
                const { songs } = await SongSelector.getFilteredSongList(
                    guildPreference,
                    true
                );

                // there is atleast one song of each language
                assert.strictEqual(
                    FOREIGN_LANGUAGE_TAGS.every((languageTag) => {
                        return Array.from(songs).some((song) => {
                            return song.tags.split("").includes(languageTag);
                        });
                    }),
                    true
                );
            });
        });
    });

    describe("release type", () => {
        describe("release type is set to official only", () => {
            it("should return main music videos only", async () => {
                await guildPreference.setReleaseType(ReleaseType.OFFICIAL);
                const { songs } = await SongSelector.getFilteredSongList(
                    guildPreference,
                    true
                );

                assert.strictEqual(
                    Array.from(songs).every((song) => song.vtype === "main"),
                    true
                );
            });
        });

        describe("release type is set to all", () => {
            it("should return music videos and audio-only", async () => {
                await guildPreference.setReleaseType(ReleaseType.ALL);
                const { songs } = await SongSelector.getFilteredSongList(
                    guildPreference,
                    true
                );

                assert.strictEqual(
                    Array.from(songs).filter((song) => song.vtype === "main")
                        .length > 0 &&
                        Array.from(songs).filter(
                            (song) => song.vtype === "audio"
                        ).length > 0,
                    true
                );
            });
        });
    });

    describe("force play", () => {
        describe("forced song exists", () => {
            it("should match that exact one song", async () => {
                const songLink = "9bZkp7q19f0";
                await guildPreference.setForcePlaySong(songLink);
                const { songs } = await SongSelector.getFilteredSongList(
                    guildPreference,
                    true
                );

                assert.strictEqual(songs.size, 1);
                assert.strictEqual([...songs][0].youtubeLink, songLink);
            });
        });

        describe("forced song does not exist", () => {
            it("should not match anything", async () => {
                await guildPreference.setForcePlaySong("oppa gangnam style");
                const { songs } = await SongSelector.getFilteredSongList(
                    guildPreference,
                    true
                );

                assert.strictEqual(songs.size, 0);
            });
        });
    });

    describe("premium", () => {
        describe("non-premium songs", () => {
            it("should only return non-premium songs", async () => {
                const isPremium = false;
                const { songs } = await SongSelector.getFilteredSongList(
                    guildPreference,
                    isPremium
                );

                assert.strictEqual(
                    Array.from(songs).every(
                        (song) =>
                            song.rank <=
                            Number(process.env.AUDIO_SONGS_PER_ARTIST)
                    ),
                    true
                );
            });
        });

        describe("premium songs", () => {
            it("should return premium and non-premium songs", async () => {
                const isPremium = true;
                const { songs } = await SongSelector.getFilteredSongList(
                    guildPreference,
                    isPremium
                );

                assert.strictEqual(
                    Array.from(songs).every(
                        (song) =>
                            song.rank <=
                            Number(process.env.PREMIUM_AUDIO_SONGS_PER_ARTIST)
                    ),
                    true
                );
            });
        });
    });
});

describe("selectRandomSong", function () {
    describe("gender override", () => {
        beforeEach(async () => {
            await guildPreference.setGender([Gender.ALTERNATING]);
        });

        describe("override to female", () => {
            it("should only return female/coed songs", async () => {
                const femaleOrCoedSongs = [];
                const filteredSongs = (
                    await SongSelector.getFilteredSongList(
                        guildPreference,
                        true
                    )
                ).songs;

                for (let i = 0; i < 10; i++) {
                    femaleOrCoedSongs.push(
                        SongSelector.selectRandomSong(
                            filteredSongs,
                            new Set(
                                femaleOrCoedSongs.map((x) => x.youtubeLink)
                            ),
                            Gender.FEMALE
                        )
                    );
                }

                assert.ok(
                    femaleOrCoedSongs.every((song) =>
                        [Gender.FEMALE, Gender.COED].includes(song.members)
                    )
                );
            });
        });

        describe("override to male", () => {
            it("should only return male/coed songs", async () => {
                const maleOrCoedSongs = [];
                const filteredSongs = (
                    await SongSelector.getFilteredSongList(
                        guildPreference,
                        true
                    )
                ).songs;

                for (let i = 0; i < 10; i++) {
                    maleOrCoedSongs.push(
                        SongSelector.selectRandomSong(
                            filteredSongs,
                            new Set(maleOrCoedSongs.map((x) => x.youtubeLink)),
                            Gender.MALE
                        )
                    );
                }

                assert.ok(
                    maleOrCoedSongs.every((song) =>
                        [Gender.MALE, Gender.COED].includes(song.members)
                    )
                );
            });
        });
    });

    describe("ignored songs", () => {
        describe("ignoring first 10 songs", () => {
            it("should return songs not including the ignored songs", async () => {
                const numIgnored = 10;
                await guildPreference.setLimit(0, 100);
                const filteredSongs = (
                    await SongSelector.getFilteredSongList(
                        guildPreference,
                        true
                    )
                ).songs;

                const ignoredSongs = new Set(
                    Array.from(filteredSongs).slice(0, numIgnored)
                );

                const selectedSongs = [];
                for (let i = 0; i < filteredSongs.size - numIgnored; i++) {
                    selectedSongs.push(
                        SongSelector.selectRandomSong(
                            filteredSongs,
                            new Set([...ignoredSongs, ...selectedSongs])
                        )
                    );
                }

                assert.strictEqual(
                    selectedSongs.length,
                    filteredSongs.size - numIgnored
                );

                assert.ok(
                    selectedSongs.every(
                        (song) => !ignoredSongs.has(song.youtubeLink)
                    )
                );
            });
        });
    });
});

describe("queryRandomSong", () => {
    let songSelector: SongSelector;

    beforeEach(() => {
        songSelector = new SongSelector();
    });

    describe("normal case", () => {
        it("should return the random song", async () => {
            await songSelector.reloadSongs(guildPreference, true);
            const song = songSelector.queryRandomSong(guildPreference);
            assert(song);
        });
    });

    describe("selected song set smaller than last played history threshold", () => {
        it("should return null", async () => {
            await guildPreference.setLimit(0, 0);
            await songSelector.reloadSongs(guildPreference, true);
            const song = songSelector.queryRandomSong(guildPreference);
            assert.strictEqual(song, null);
        });
    });

    describe("unique shuffle mode", () => {
        it("should return the random song, and add it to the unique song history", async () => {
            await guildPreference.setShuffleType(ShuffleType.RANDOM);
            await songSelector.reloadSongs(guildPreference, true);
            const song = songSelector.queryRandomSong(guildPreference);
            assert(song);

            assert.strictEqual(songSelector.uniqueSongsPlayed.size, 1);
            assert.strictEqual(
                [...songSelector.uniqueSongsPlayed][0],
                song.youtubeLink
            );
        });
    });

    describe("popularity shuffle mode", () => {
        it("should have descending views", async () => {
            const limit = 100;
            await guildPreference.setShuffleType(ShuffleType.POPULARITY);
            await guildPreference.setLimit(0, limit);
            await songSelector.reloadSongs(guildPreference, true);

            const songs: Array<QueriedSong> = [];
            for (let i = 0; i < limit; i++) {
                songs.push(songSelector.queryRandomSong(guildPreference));
            }

            for (let i = 1; i < songs.length - 1; i++) {
                assert.ok(songs[i - 1].views > songs[i].views);
            }
        });
    });
});

describe("checkUniqueSongQueue", () => {
    let songSelector: SongSelector;
    const sandbox = sinon.createSandbox();
    let resetSpy: sinon.SinonSpy;

    beforeEach(() => {
        songSelector = new SongSelector();
        resetSpy = sandbox.spy(songSelector, "resetUniqueSongs");
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe("random shuffle mode", () => {
        describe("selected songs doesn't change midway", () => {
            describe("not all songs have been played yet", () => {
                it("should not reset the unique song queue", async () => {
                    const numberSongs = 5;
                    await guildPreference.setShuffleType(ShuffleType.RANDOM);
                    await guildPreference.setLimit(0, numberSongs);
                    await songSelector.reloadSongs(guildPreference, true);

                    // play all songs but one
                    for (let i = 0; i < numberSongs - 1; i++) {
                        assert(songSelector.queryRandomSong(guildPreference));

                        assert.strictEqual(
                            songSelector.checkUniqueSongQueue(),
                            false
                        );
                    }

                    assert.strictEqual(resetSpy.called, false);
                });
            });

            describe("all songs have been played", () => {
                describe("limit greater than LAST_PLAYED_SONG_QUEUE_SIZE (Bug #1158)", () => {
                    it("should reset the unique song queue, queryRandomSong should not return null ", async () => {
                        const numberSongs = LAST_PLAYED_SONG_QUEUE_SIZE + 1;
                        await guildPreference.setShuffleType(
                            ShuffleType.RANDOM
                        );
                        await guildPreference.setLimit(0, numberSongs);
                        await songSelector.reloadSongs(guildPreference, true);

                        // play all songs
                        for (let i = 0; i < numberSongs; i++) {
                            assert(
                                songSelector.queryRandomSong(guildPreference)
                            );
                        }

                        assert.strictEqual(resetSpy.called, false);

                        assert.strictEqual(
                            songSelector.checkUniqueSongQueue(),
                            true
                        );

                        assert.strictEqual(resetSpy.called, true);
                        // play the first song after reset
                        assert(songSelector.queryRandomSong(guildPreference));
                    });
                });

                describe("limit smaller than LAST_PLAYED_SONG_QUEUE_SIZE", () => {
                    it("should reset the unique song queue", async () => {
                        const numberSongs = 5;
                        await guildPreference.setShuffleType(
                            ShuffleType.RANDOM
                        );
                        await guildPreference.setLimit(0, numberSongs);
                        await songSelector.reloadSongs(guildPreference, true);

                        // play all songs but one
                        for (let i = 0; i < numberSongs - 1; i++) {
                            assert(
                                songSelector.queryRandomSong(guildPreference)
                            );

                            assert.strictEqual(
                                songSelector.checkUniqueSongQueue(),
                                false
                            );
                        }

                        assert.strictEqual(resetSpy.called, false);
                        // play the last song
                        assert(songSelector.queryRandomSong(guildPreference));

                        assert.strictEqual(
                            songSelector.checkUniqueSongQueue(),
                            true
                        );
                        assert.strictEqual(resetSpy.called, true);
                    });
                });
            });

            describe("all songs have been played, multiple times", () => {
                it("should reset the unique song queue several times", async () => {
                    const numberSongs = 5;
                    const numberOfResets = 50;
                    await guildPreference.setShuffleType(ShuffleType.RANDOM);
                    await guildPreference.setLimit(0, numberSongs);
                    await songSelector.reloadSongs(guildPreference, true);

                    // play all songs but one
                    for (let i = 0; i < numberSongs * numberOfResets; i++) {
                        assert(songSelector.queryRandomSong(guildPreference));
                        if (i > 0 && (i + 1) % numberSongs === 0) {
                            assert.strictEqual(
                                songSelector.checkUniqueSongQueue(),
                                true
                            );
                        } else {
                            assert.strictEqual(
                                songSelector.checkUniqueSongQueue(),
                                false
                            );
                        }
                    }

                    assert.strictEqual(resetSpy.callCount, numberOfResets);
                });
            });
        });

        describe("selected songs changes midway", () => {
            describe("new selected song set is a subset of the original, new selected song set has already been played", () => {
                it("should reset the unique song queue", async () => {
                    const numberSongs = 10;
                    const newNumberSongs = numberSongs / 2;
                    await guildPreference.setShuffleType(ShuffleType.RANDOM);
                    await guildPreference.setLimit(0, numberSongs);
                    await songSelector.reloadSongs(guildPreference, true);

                    // play more than enough songs for the new selected song set, but not enough for current
                    const songs = [...songSelector.getSongs().songs]
                        .map((x) => x.youtubeLink)
                        .slice(0, newNumberSongs + 1);

                    songSelector.uniqueSongsPlayed = new Set(songs);
                    assert.strictEqual(
                        songSelector.checkUniqueSongQueue(),
                        false
                    );
                    assert.strictEqual(resetSpy.called, false);

                    // reload for new selected song set
                    await guildPreference.setLimit(0, newNumberSongs);
                    await songSelector.reloadSongs(guildPreference, true);

                    // expect unique song queue to have been reset
                    assert.strictEqual(
                        songSelector.checkUniqueSongQueue(),
                        true
                    );
                    assert.strictEqual(resetSpy.called, true);
                });
            });

            describe("new selected song set is a superset of the original, new selected song set has already been played", () => {
                it("should reset the unique song queue", async () => {
                    const numberSongs = 10;
                    const newNumberSongs = numberSongs + 1;
                    await guildPreference.setShuffleType(ShuffleType.RANDOM);
                    await guildPreference.setLimit(0, numberSongs);
                    await songSelector.reloadSongs(guildPreference, true);
                    let songs = [...songSelector.getSongs().songs].map(
                        (x) => x.youtubeLink
                    );

                    // play all but one of the songs
                    songSelector.uniqueSongsPlayed = new Set(
                        songs.slice(0, -1)
                    );

                    assert.strictEqual(
                        songSelector.checkUniqueSongQueue(),
                        false
                    );

                    // update to superset song set
                    await guildPreference.setLimit(0, newNumberSongs);
                    await songSelector.reloadSongs(guildPreference, true);
                    assert.strictEqual(
                        songSelector.checkUniqueSongQueue(),
                        false
                    );
                    assert.strictEqual(resetSpy.called, false);

                    // play remaining two songs
                    songs = [...songSelector.getSongs().songs].map(
                        (x) => x.youtubeLink
                    );
                    songSelector.uniqueSongsPlayed = new Set(songs);

                    // expect unique song queue to have been reset
                    assert.strictEqual(
                        songSelector.checkUniqueSongQueue(),
                        true
                    );
                    assert.strictEqual(resetSpy.called, true);
                });
            });

            describe("unique song history has songs not in the current selected song set", () => {
                it("should reset the unique song queue", async () => {
                    const numberSongs = 10;
                    await guildPreference.setShuffleType(ShuffleType.RANDOM);
                    await guildPreference.setLimit(0, numberSongs);
                    await songSelector.reloadSongs(guildPreference, true);
                    const songs = [...songSelector.getSongs().songs].map(
                        (x) => x.youtubeLink
                    );

                    const songsNotInSet = ["AAAAAAA", "BBBBBB", "CCCCCCCC"];

                    // play songs in set (not enough to reset), with some songs not in set
                    songSelector.uniqueSongsPlayed = new Set(
                        songs
                            .slice(0, numberSongs - songsNotInSet.length)
                            .concat(songsNotInSet)
                    );

                    assert.strictEqual(
                        songSelector.checkUniqueSongQueue(),
                        false
                    );
                    assert.strictEqual(resetSpy.called, false);

                    // play songs in set (enough to reset)
                    songSelector.uniqueSongsPlayed = new Set(
                        songs.slice(0, numberSongs).concat(songsNotInSet)
                    );

                    assert.strictEqual(
                        songSelector.checkUniqueSongQueue(),
                        true
                    );
                    assert.strictEqual(resetSpy.called, true);
                });
            });
        });
    });
});

describe("checkAlternatingGender", () => {
    let songSelector: SongSelector;

    beforeEach(() => {
        songSelector = new SongSelector();
    });

    describe("alternating gender is not set", () => {
        it("should set lastAlternatingGender to null", async () => {
            await guildPreference.setGender([Gender.MALE]);
            assert.strictEqual(songSelector.lastAlternatingGender, null);
        });
    });

    describe("alternating gender is set", () => {
        beforeEach(async () => {
            await guildPreference.setGender([Gender.ALTERNATING]);
        });

        describe("lastAlternatingGender is null", () => {
            it("should assign a value", () => {
                songSelector.lastAlternatingGender = null;
                songSelector.checkAlternatingGender(guildPreference);
                assert(songSelector.lastAlternatingGender);
            });
        });

        describe("lastAlternatingGender is not null", () => {
            describe("lastAlternatingGender is male", () => {
                it("should set lastAlternating Gender to female", () => {
                    songSelector.lastAlternatingGender = Gender.MALE;
                    songSelector.checkAlternatingGender(guildPreference);
                    assert.strictEqual(
                        songSelector.lastAlternatingGender,
                        Gender.FEMALE
                    );
                });
            });

            describe("lastAlternatingGender is female", () => {
                it("should set lastAlternating Gender to male", () => {
                    songSelector.lastAlternatingGender = Gender.FEMALE;
                    songSelector.checkAlternatingGender(guildPreference);
                    assert.strictEqual(
                        songSelector.lastAlternatingGender,
                        Gender.MALE
                    );
                });
            });
        });
    });
});
