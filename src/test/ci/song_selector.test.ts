import assert from "assert";
import sinon from "sinon";
import { Gender } from "../../commands/game_options/gender";
import { OstPreference } from "../../commands/game_options/ost";
import {
    NON_OFFICIAL_VIDEO_TAGS,
    ReleaseType,
} from "../../commands/game_options/release";
import { SubunitsPreference } from "../../commands/game_options/subunits";
import GuildPreference from "../../structures/guild_preference";
import { mockArtists, mockSongs } from "../test_setup";
import SongSelector, {
    LAST_PLAYED_SONG_QUEUE_SIZE,
} from "../../structures/song_selector";
import { ArtistType } from "../../commands/game_options/artisttype";
import { getMatchingGroupNames } from "../../helpers/game_utils";
import {
    FOREIGN_LANGUAGE_TAGS,
    LanguageType,
} from "../../commands/game_options/language";
import { ShuffleType } from "../../commands/game_options/shuffle";
import { DEFAULT_BEGINNING_SEARCH_YEAR } from "../../commands/game_options/cutoff";

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
        const expectedSongCounts = {
            [Gender.MALE]: mockSongs.filter((song) => song.members === "male")
                .length,
            [Gender.FEMALE]: mockSongs.filter(
                (song) => song.members === "female"
            ).length,
            [Gender.COED]: mockSongs.filter((song) => song.members === "coed")
                .length,
        };

        describe("single-select gender", () => {
            it("should match the expected song count", async () => {
                for (const gender of [
                    Gender.MALE,
                    Gender.FEMALE,
                    Gender.COED,
                ]) {
                    await guildPreference.setGender([gender]);
                    const { songs } = await SongSelector.getFilteredSongList(
                        guildPreference
                    );

                    assert.strictEqual(
                        songs.size,
                        expectedSongCounts[gender],
                        `Gender query (${gender}) does not match with actual gender count`
                    );
                }
            });
        });

        describe("multi-select gender", () => {
            it("should match the expected song count", async () => {
                await guildPreference.setGender([Gender.MALE, Gender.FEMALE]);
                const { songs } = await SongSelector.getFilteredSongList(
                    guildPreference
                );

                assert.strictEqual(
                    songs.size,
                    expectedSongCounts[Gender.MALE] +
                        expectedSongCounts[Gender.FEMALE]
                );
            });
        });
    });

    describe("groups", () => {
        const expectedSongCounts = mockArtists.reduce((map, obj) => {
            map[obj.id] = mockSongs.filter(
                (song) => song.id_artist === obj.id
            ).length;
            return map;
        }, {});

        beforeEach(async () => {
            await guildPreference.setGender([Gender.ALTERNATING]);
        });

        describe("single-selected group", () => {
            it("should match the expected song count", async () => {
                for (const artist of mockArtists) {
                    await guildPreference.setGroups([
                        { id: artist.id, name: artist.name },
                    ]);
                    const { songs } = await SongSelector.getFilteredSongList(
                        guildPreference
                    );

                    assert.strictEqual(
                        songs.size,
                        expectedSongCounts[artist.id]
                    );
                }
            });
        });

        describe("multi-selected groups", () => {
            it("should match the expected song count", async () => {
                const mockArtistSubset = mockArtists.slice(0, 5);
                await guildPreference.setGroups(
                    mockArtistSubset.map((artist) => ({
                        id: artist.id,
                        name: artist.name,
                    }))
                );
                const { songs } = await SongSelector.getFilteredSongList(
                    guildPreference
                );

                const expectedMultiSongCount = mockArtistSubset.reduce(
                    (sum, artist) => sum + expectedSongCounts[artist.id],
                    0
                );

                assert.strictEqual(songs.size, expectedMultiSongCount);
            });
        });
    });

    describe("includes", () => {
        const expectedFemaleCount = mockSongs.filter(
            (song) => song.members === Gender.FEMALE
        ).length;

        const includedArtists = mockArtists
            .filter((artist) => artist.members === Gender.MALE)
            .slice(0, 2);

        const expectedIncludeCount = mockSongs.filter((song) =>
            includedArtists.map((artist) => artist.id).includes(song.id_artist)
        ).length;

        describe("female gender, include 2 male groups", () => {
            it("should match the expected song count", async () => {
                await guildPreference.setGender([Gender.FEMALE]);
                await guildPreference.setIncludes(
                    includedArtists.map((artist) => ({
                        id: artist.id,
                        name: artist.name,
                    }))
                );
                const { songs } = await SongSelector.getFilteredSongList(
                    guildPreference
                );

                assert.strictEqual(
                    songs.size,
                    expectedFemaleCount + expectedIncludeCount
                );
            });
        });
    });

    describe("excludes", () => {
        const expectedFemaleCount = mockSongs.filter(
            (song) => song.members === Gender.FEMALE
        ).length;

        const excludeArtists = mockArtists
            .filter((artist) => artist.members === Gender.FEMALE)
            .slice(0, 2);

        const expectedExcludeCount = mockSongs.filter((song) =>
            excludeArtists.map((artist) => artist.id).includes(song.id_artist)
        ).length;

        describe("female gender, exclude 2 female groups", () => {
            it("should match the expected song count", async () => {
                await guildPreference.setGender([Gender.FEMALE]);
                await guildPreference.setExcludes(
                    excludeArtists.map((artist) => ({
                        id: artist.id,
                        name: artist.name,
                    }))
                );
                const { songs } = await SongSelector.getFilteredSongList(
                    guildPreference
                );

                assert.strictEqual(
                    songs.size,
                    expectedFemaleCount - expectedExcludeCount
                );
            });
        });
    });

    describe("artist type", () => {
        const expectedSoloistCount = mockSongs.filter(
            (song) => song.issolo === "y"
        ).length;

        const expectedGroupsCount = mockSongs.filter(
            (song) => song.issolo === "n"
        ).length;

        describe("soloists", () => {
            it("should match the expected song count", async () => {
                await guildPreference.setArtistType(ArtistType.SOLOIST);
                const { songs } = await SongSelector.getFilteredSongList(
                    guildPreference
                );

                assert.strictEqual(songs.size, expectedSoloistCount);
            });
        });

        describe("groups", () => {
            it("should match the expected song count", async () => {
                await guildPreference.setArtistType(ArtistType.GROUP);
                const { songs } = await SongSelector.getFilteredSongList(
                    guildPreference
                );

                assert.strictEqual(songs.size, expectedGroupsCount);
            });
        });
    });

    describe("cutoff", () => {
        describe("songs in or after 2016", () => {
            it("should match the expected song count", async () => {
                const expectedSongCount = mockSongs.filter(
                    (song) => song.publishedon >= new Date("2016-01-01")
                ).length;

                await guildPreference.setCutoff(2016);
                const { songs } = await SongSelector.getFilteredSongList(
                    guildPreference
                );

                assert.strictEqual(songs.size, expectedSongCount);
            });
        });

        describe("songs in or before 2015", () => {
            it("should match the expected song count", async () => {
                const expectedSongCount = mockSongs.filter(
                    (song) => song.publishedon <= new Date("2015-12-31")
                ).length;

                await guildPreference.setCutoff(
                    DEFAULT_BEGINNING_SEARCH_YEAR,
                    2015
                );
                const { songs } = await SongSelector.getFilteredSongList(
                    guildPreference
                );

                assert.strictEqual(songs.size, expectedSongCount);
            });
        });

        describe("songs between 2008 and 2018", () => {
            it("should match the expected song count", async () => {
                const expectedSongCount = mockSongs.filter(
                    (song) =>
                        song.publishedon >= new Date("2008-01-01") &&
                        song.publishedon <= new Date("2018-12-31")
                ).length;

                await guildPreference.setCutoff(2008, 2018);
                const { songs } = await SongSelector.getFilteredSongList(
                    guildPreference
                );

                assert.strictEqual(songs.size, expectedSongCount);
            });
        });

        describe("songs in 2017", () => {
            it("should match the expected song count", async () => {
                const expectedSongCount = mockSongs.filter(
                    (song) =>
                        song.publishedon >= new Date("2017-01-01") &&
                        song.publishedon <= new Date("2017-12-31")
                ).length;

                await guildPreference.setCutoff(2017, 2017);
                const { songs } = await SongSelector.getFilteredSongList(
                    guildPreference
                );

                assert.strictEqual(songs.size, expectedSongCount);
            });
        });
    });

    describe("subunits", () => {
        const artistWithSubunit = mockArtists[7];
        const subunitArtist = mockArtists[8];

        describe("exclude subunits", () => {
            it("should match the expected song count", async () => {
                await guildPreference.setGroups([
                    { id: artistWithSubunit.id, name: artistWithSubunit.name },
                ]);
                const expectedSongCount = mockSongs.filter(
                    (song) => song.id_artist === artistWithSubunit.id
                ).length;

                await guildPreference.setSubunitPreference(
                    SubunitsPreference.EXCLUDE
                );
                const { songs } = await SongSelector.getFilteredSongList(
                    guildPreference
                );

                assert.strictEqual(songs.size, expectedSongCount);
            });
        });

        describe("include subunits", () => {
            it("should match the expected song count", async () => {
                await guildPreference.setGroups([
                    { id: artistWithSubunit.id, name: artistWithSubunit.name },
                ]);
                const expectedSongCount = mockSongs.filter(
                    (song) =>
                        song.id_artist === artistWithSubunit.id ||
                        song.id_artist === subunitArtist.id
                ).length;

                await guildPreference.setSubunitPreference(
                    SubunitsPreference.INCLUDE
                );
                const { songs } = await SongSelector.getFilteredSongList(
                    guildPreference
                );

                assert.strictEqual(songs.size, expectedSongCount);
            });
        });

        describe("include subunits (and the subunit has a collab)", () => {
            it("should match the songs from the group, collabs of that group, and collabs of any subunits of that group", async () => {
                // E is a group with the subunit F. F is in a collab with G. E has a collab with H.
                // E
                const artistWithCollabingSubunit = mockArtists[4];
                // F
                const subunitWithCollab = mockArtists[5];
                // F + G
                const subunitCollabArtist = mockArtists[12];
                // E + H
                const parentCollabArtist = mockArtists[13];

                const { matchedGroups, unmatchedGroups } =
                    await getMatchingGroupNames([
                        artistWithCollabingSubunit.name,
                    ]);

                await guildPreference.setGroups(matchedGroups);
                await guildPreference.setSubunitPreference(
                    SubunitsPreference.INCLUDE
                );
                const expectedSongs = mockSongs.filter((song) =>
                    [
                        artistWithCollabingSubunit.id,
                        subunitWithCollab.id,
                        subunitCollabArtist.id,
                        parentCollabArtist.id,
                    ].includes(song.id_artist)
                );

                const { songs } = await SongSelector.getFilteredSongList(
                    guildPreference
                );

                assert.strictEqual(unmatchedGroups.length, 0);
                assert.deepStrictEqual(
                    [...songs].map((x) => x.youtubeLink).sort(),
                    expectedSongs.map((x) => x.link).sort()
                );
            });
        });
    });

    describe("OSTs", () => {
        describe("exclude OSTs", () => {
            it("should match the expected song count", async () => {
                const expectedSongCount = mockSongs.filter(
                    (song) => !song.tags.includes("o")
                ).length;

                await guildPreference.setOstPreference(OstPreference.EXCLUDE);
                const { songs } = await SongSelector.getFilteredSongList(
                    guildPreference
                );

                assert.strictEqual(songs.size, expectedSongCount);
            });
        });

        describe("include OSTs", () => {
            it("should match the expected song count", async () => {
                const expectedSongCount = mockSongs.length;
                await guildPreference.setOstPreference(OstPreference.INCLUDE);
                const { songs } = await SongSelector.getFilteredSongList(
                    guildPreference
                );

                assert.strictEqual(songs.size, expectedSongCount);
            });
        });

        describe("exclusive OSTs", () => {
            it("should match the expected song count", async () => {
                const expectedSongCount = mockSongs.filter((song) =>
                    song.tags.includes("o")
                ).length;

                await guildPreference.setOstPreference(OstPreference.EXCLUSIVE);
                const { songs } = await SongSelector.getFilteredSongList(
                    guildPreference
                );

                assert.strictEqual(songs.size, expectedSongCount);
            });
        });
    });

    describe("limit", () => {
        const limit = 17;
        beforeEach(async () => {
            await guildPreference.setGender([Gender.COED]);
        });

        describe("with limit", () => {
            it("should match the expected song count", async () => {
                const expectedSongCount = limit;
                await guildPreference.setLimit(0, limit);
                const { songs } = await SongSelector.getFilteredSongList(
                    guildPreference
                );

                assert.strictEqual(songs.size, expectedSongCount);
            });
        });

        describe("without limit", () => {
            it("should match the expected song count", async () => {
                const expectedSongCount = mockSongs.filter(
                    (song) => song.members === Gender.COED
                ).length;

                const { songs } = await SongSelector.getFilteredSongList(
                    guildPreference
                );

                assert.strictEqual(songs.size, expectedSongCount);
            });
        });
    });

    describe("language", () => {
        describe("language is set to korean only", () => {
            it("should match the expected song count", async () => {
                const expectedSongCount = mockSongs.filter(
                    (song) =>
                        !FOREIGN_LANGUAGE_TAGS.some((tag) =>
                            song.tags.includes(tag)
                        )
                ).length;

                await guildPreference.setLanguageType(LanguageType.KOREAN);
                const { songs } = await SongSelector.getFilteredSongList(
                    guildPreference
                );

                assert.strictEqual(songs.size, expectedSongCount);
            });
        });

        describe("language is set to all", () => {
            it("should match the expected song count", async () => {
                await guildPreference.setLanguageType(LanguageType.ALL);
                const { songs } = await SongSelector.getFilteredSongList(
                    guildPreference
                );

                assert.strictEqual(songs.size, mockSongs.length);
            });
        });
    });

    describe("release type", () => {
        describe("release type is set to official only", () => {
            it("should match the expected song count", async () => {
                const expectedSongCount = mockSongs.filter(
                    (song) =>
                        !NON_OFFICIAL_VIDEO_TAGS.some((tag) =>
                            song.tags.includes(tag)
                        ) && song.vtype === "main"
                ).length;

                await guildPreference.setReleaseType(ReleaseType.OFFICIAL);
                const { songs } = await SongSelector.getFilteredSongList(
                    guildPreference
                );

                assert.strictEqual(songs.size, expectedSongCount);
            });
        });

        describe("release type is set to all", () => {
            it("should match the expected song count", async () => {
                await guildPreference.setReleaseType(ReleaseType.ALL);
                const { songs } = await SongSelector.getFilteredSongList(
                    guildPreference
                );

                assert.strictEqual(songs.size, mockSongs.length);
            });
        });
    });

    describe("force play", async () => {
        describe("forced song exists", () => {
            it("should match that exact one song", async () => {
                const forcedSong = mockSongs[1];
                await guildPreference.setForcePlaySong(forcedSong.link);
                const { songs } = await SongSelector.getFilteredSongList(
                    guildPreference
                );

                assert.strictEqual(songs.size, 1);
                assert.strictEqual([...songs][0].youtubeLink, forcedSong.link);
            });
        });

        describe("forced song does not exist", () => {
            it("should not match anything", async () => {
                await guildPreference.setForcePlaySong(
                    "WOOOOOOOOOOOOOOOOOOOOOOOOOOOOOO"
                );
                const { songs } = await SongSelector.getFilteredSongList(
                    guildPreference
                );

                assert.strictEqual(songs.size, 0);
            });
        });
    });
});

describe("selectRandomSong", () => {
    describe("gender override", () => {
        beforeEach(async () => {
            await guildPreference.setGender([Gender.ALTERNATING]);
        });

        describe("override to female", () => {
            it("should match the expected song count of female + coed songs", async () => {
                const femaleOrCoedSongs = [];
                const filteredSongs = (
                    await SongSelector.getFilteredSongList(guildPreference)
                ).songs;

                const femaleOrCoedSongCount = [...filteredSongs].filter((x) =>
                    [Gender.FEMALE, Gender.COED].includes(x.members)
                ).length;

                for (let i = 0; i < femaleOrCoedSongCount; i++) {
                    femaleOrCoedSongs.push(
                        await SongSelector.selectRandomSong(
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

                assert.strictEqual(
                    femaleOrCoedSongCount,
                    femaleOrCoedSongs.length
                );
            });
        });

        describe("override to male", () => {
            it("should match the expected song count of male + coed songs", async () => {
                const maleOrCoedSongs = [];
                const filteredSongs = (
                    await SongSelector.getFilteredSongList(guildPreference)
                ).songs;

                const maleOrCoedSongCount = [...filteredSongs].filter((x) =>
                    [Gender.MALE, Gender.COED].includes(x.members)
                ).length;

                for (let i = 0; i < maleOrCoedSongCount; i++) {
                    maleOrCoedSongs.push(
                        await SongSelector.selectRandomSong(
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
                assert.strictEqual(maleOrCoedSongCount, maleOrCoedSongs.length);
            });
        });
    });

    describe("ignored songs", () => {
        describe("ignoring first 10 songs", () => {
            it("should match the expected song count", async () => {
                const numIgnored = 10;
                const ignoredSongs = new Set(
                    mockSongs.slice(0, numIgnored).map((song) => song.link)
                );

                const filteredSongs = (
                    await SongSelector.getFilteredSongList(guildPreference)
                ).songs;

                const selectedSongs = [];
                for (let i = 0; i < filteredSongs.size - numIgnored; i++) {
                    selectedSongs.push(
                        await SongSelector.selectRandomSong(
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

    beforeEach(async () => {
        songSelector = new SongSelector();
    });

    describe("normal case", () => {
        it("should return the random song, and add to last played history", async () => {
            await songSelector.reloadSongs(guildPreference);
            const song = await songSelector.queryRandomSong(guildPreference);
            assert(song);
            assert.strictEqual(songSelector.lastPlayedSongs.length, 1);
            assert.strictEqual(
                songSelector.lastPlayedSongs[0],
                song.youtubeLink
            );
        });
    });

    describe("selected song set smaller than last played history threshold", () => {
        it("should return null, and NOT add to last played history", async () => {
            await guildPreference.setLimit(0, 0);
            await songSelector.reloadSongs(guildPreference);
            const song = await songSelector.queryRandomSong(guildPreference);
            assert.strictEqual(song, null);
            assert.strictEqual(songSelector.lastPlayedSongs.length, 0);
        });
    });

    describe("unique shuffle mode", () => {
        it("should return the random song, and add to last played history, and unique song history", async () => {
            await guildPreference.setShuffleType(ShuffleType.UNIQUE);
            await songSelector.reloadSongs(guildPreference);
            const song = await songSelector.queryRandomSong(guildPreference);
            assert(song);
            assert.strictEqual(songSelector.lastPlayedSongs.length, 1);
            assert.strictEqual(
                songSelector.lastPlayedSongs[0],
                song.youtubeLink
            );

            assert.strictEqual(songSelector.uniqueSongsPlayed.size, 1);
            assert.strictEqual(
                [...songSelector.uniqueSongsPlayed][0],
                song.youtubeLink
            );
        });
    });
});

describe("checkUniqueSongQueue", () => {
    let songSelector: SongSelector;
    const sandbox = sinon.createSandbox();
    let resetSpy: sinon.SinonSpy;

    beforeEach(async () => {
        songSelector = new SongSelector();
        resetSpy = sandbox.spy(songSelector, "resetUniqueSongs");
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe("non-unique shuffle mode", () => {
        it("should return false", async () => {
            await guildPreference.setShuffleType(ShuffleType.RANDOM);
            await songSelector.reloadSongs(guildPreference);
            assert.strictEqual(
                songSelector.checkUniqueSongQueue(guildPreference),
                false
            );
            assert.strictEqual(resetSpy.called, true);
        });
    });

    describe("unique shiffle mode", () => {
        describe("selected songs doesn't change midway", () => {
            describe("not all songs have been played yet", () => {
                it("should not reset the unique song queue", async () => {
                    const numberSongs = 5;
                    await guildPreference.setShuffleType(ShuffleType.UNIQUE);
                    await guildPreference.setLimit(0, numberSongs);
                    await songSelector.reloadSongs(guildPreference);

                    // play all songs but one
                    for (let i = 0; i < numberSongs - 1; i++) {
                        assert(
                            await songSelector.queryRandomSong(guildPreference)
                        );

                        assert.strictEqual(
                            songSelector.checkUniqueSongQueue(guildPreference),
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
                            ShuffleType.UNIQUE
                        );
                        await guildPreference.setLimit(0, numberSongs);
                        await songSelector.reloadSongs(guildPreference);

                        // play all songs
                        for (let i = 0; i < numberSongs; i++) {
                            assert(
                                await songSelector.queryRandomSong(
                                    guildPreference
                                )
                            );
                        }

                        assert.strictEqual(resetSpy.called, false);

                        assert.strictEqual(
                            songSelector.checkUniqueSongQueue(guildPreference),
                            true
                        );

                        assert.strictEqual(resetSpy.called, true);
                        // play the first song after reset
                        assert(
                            await songSelector.queryRandomSong(guildPreference)
                        );
                    });
                });

                describe("limit smaller than LAST_PLAYED_SONG_QUEUE_SIZE", () => {
                    it("should reset the unique song queue", async () => {
                        const numberSongs = 5;
                        await guildPreference.setShuffleType(
                            ShuffleType.UNIQUE
                        );
                        await guildPreference.setLimit(0, numberSongs);
                        await songSelector.reloadSongs(guildPreference);

                        // play all songs but one
                        for (let i = 0; i < numberSongs - 1; i++) {
                            assert(
                                await songSelector.queryRandomSong(
                                    guildPreference
                                )
                            );

                            assert.strictEqual(
                                songSelector.checkUniqueSongQueue(
                                    guildPreference
                                ),
                                false
                            );
                        }

                        assert.strictEqual(resetSpy.called, false);
                        // play the last song
                        assert(
                            await songSelector.queryRandomSong(guildPreference)
                        );

                        assert.strictEqual(
                            songSelector.checkUniqueSongQueue(guildPreference),
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
                    await guildPreference.setShuffleType(ShuffleType.UNIQUE);
                    await guildPreference.setLimit(0, numberSongs);
                    await songSelector.reloadSongs(guildPreference);

                    // play all songs but one
                    for (let i = 0; i < numberSongs * numberOfResets; i++) {
                        assert(
                            await songSelector.queryRandomSong(guildPreference)
                        );
                        if (i > 0 && (i + 1) % numberSongs === 0) {
                            assert.strictEqual(
                                songSelector.checkUniqueSongQueue(
                                    guildPreference
                                ),
                                true
                            );
                        } else {
                            assert.strictEqual(
                                songSelector.checkUniqueSongQueue(
                                    guildPreference
                                ),
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
                    await guildPreference.setShuffleType(ShuffleType.UNIQUE);
                    await guildPreference.setLimit(0, numberSongs);
                    await songSelector.reloadSongs(guildPreference);

                    // play more than enough songs for the new selected song set, but not enough for current
                    const songs = [...songSelector.getSongs().songs]
                        .map((x) => x.youtubeLink)
                        .slice(0, newNumberSongs + 1);

                    songSelector.uniqueSongsPlayed = new Set(songs);
                    assert.strictEqual(
                        songSelector.checkUniqueSongQueue(guildPreference),
                        false
                    );
                    assert.strictEqual(resetSpy.called, false);

                    // reload for new selected song set
                    await guildPreference.setLimit(0, newNumberSongs);
                    await songSelector.reloadSongs(guildPreference);

                    // expect unique song queue to have been reset
                    assert.strictEqual(
                        songSelector.checkUniqueSongQueue(guildPreference),
                        true
                    );
                    assert.strictEqual(resetSpy.called, true);
                });
            });

            describe("new selected song set is a superset of the original, new selected song set has already been played", () => {
                it("should reset the unique song queue", async () => {
                    const numberSongs = 10;
                    const newNumberSongs = numberSongs + 1;
                    await guildPreference.setShuffleType(ShuffleType.UNIQUE);
                    await guildPreference.setLimit(0, numberSongs);
                    await songSelector.reloadSongs(guildPreference);
                    let songs = [...songSelector.getSongs().songs].map(
                        (x) => x.youtubeLink
                    );

                    // play all but one of the songs
                    songSelector.uniqueSongsPlayed = new Set(
                        songs.slice(0, -1)
                    );

                    assert.strictEqual(
                        songSelector.checkUniqueSongQueue(guildPreference),
                        false
                    );

                    // update to superset song set
                    await guildPreference.setLimit(0, newNumberSongs);
                    await songSelector.reloadSongs(guildPreference);
                    assert.strictEqual(
                        songSelector.checkUniqueSongQueue(guildPreference),
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
                        songSelector.checkUniqueSongQueue(guildPreference),
                        true
                    );
                    assert.strictEqual(resetSpy.called, true);
                });
            });

            describe("unique song history has songs not in the current selected song set", () => {
                it("should reset the unique song queue", async () => {
                    const numberSongs = 10;
                    await guildPreference.setShuffleType(ShuffleType.UNIQUE);
                    await guildPreference.setLimit(0, numberSongs);
                    await songSelector.reloadSongs(guildPreference);
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
                        songSelector.checkUniqueSongQueue(guildPreference),
                        false
                    );
                    assert.strictEqual(resetSpy.called, false);

                    // play songs in set (enough to reset)
                    songSelector.uniqueSongsPlayed = new Set(
                        songs.slice(0, numberSongs).concat(songsNotInSet)
                    );

                    assert.strictEqual(
                        songSelector.checkUniqueSongQueue(guildPreference),
                        true
                    );
                    assert.strictEqual(resetSpy.called, true);
                });
            });
        });
    });
});

describe("checkLastPlayedSongs", () => {
    let songSelector: SongSelector;

    beforeEach(async () => {
        songSelector = new SongSelector();
    });

    describe("empty last played history", () => {
        it("should not change", async () => {
            await songSelector.reloadSongs(guildPreference);
            songSelector.lastPlayedSongs = [];
            songSelector.checkLastPlayedSongs();
            assert.strictEqual(songSelector.lastPlayedSongs.length, 0);
        });
    });

    describe("selected song set smaller than last played history threshold", () => {
        it("should reset to zero", async () => {
            const numSongs = LAST_PLAYED_SONG_QUEUE_SIZE - 1;
            await guildPreference.setLimit(0, numSongs);
            await songSelector.reloadSongs(guildPreference);
            const songs = [...songSelector.getSongs().songs].map(
                (x) => x.youtubeLink
            );

            const songsPlayed = songs.slice(0, numSongs / 2);
            songSelector.lastPlayedSongs = songsPlayed;
            songSelector.checkLastPlayedSongs();
            assert.strictEqual(songSelector.lastPlayedSongs.length, 0);
        });
    });

    describe("selected song set larger than last played history threshold", () => {
        describe("last played history smaller than threshold", () => {
            it("should not change", async () => {
                const numSongs = LAST_PLAYED_SONG_QUEUE_SIZE + 5;
                await guildPreference.setLimit(0, numSongs);
                await songSelector.reloadSongs(guildPreference);
                const songs = [...songSelector.getSongs().songs].map(
                    (x) => x.youtubeLink
                );

                const songsPlayed = songs.slice(
                    0,
                    LAST_PLAYED_SONG_QUEUE_SIZE - 1
                );

                songSelector.lastPlayedSongs = songsPlayed;
                songSelector.checkLastPlayedSongs();
                assert.strictEqual(
                    songSelector.lastPlayedSongs.length,
                    songsPlayed.length
                );
            });
        });

        describe("last played history equal to threshold", () => {
            describe("selected song set is large", () => {
                it("should shift the queue", async () => {
                    const numSongs = 100;
                    await guildPreference.setLimit(0, numSongs);
                    await songSelector.reloadSongs(guildPreference);
                    const songs = [...songSelector.getSongs().songs].map(
                        (x) => x.youtubeLink
                    );

                    songSelector.lastPlayedSongs = songs.slice(
                        0,
                        LAST_PLAYED_SONG_QUEUE_SIZE
                    );
                    songSelector.checkLastPlayedSongs();
                    assert.strictEqual(
                        songSelector.lastPlayedSongs.length,
                        LAST_PLAYED_SONG_QUEUE_SIZE - 1
                    );

                    assert.strictEqual(
                        songSelector.lastPlayedSongs[0],
                        songs[1]
                    );
                });
            });

            describe("selected song set is small", () => {
                it("should purge only half of the queue", async () => {
                    const numSongs = LAST_PLAYED_SONG_QUEUE_SIZE * 1.5;
                    await guildPreference.setLimit(0, numSongs);
                    await songSelector.reloadSongs(guildPreference);
                    const songs = [...songSelector.getSongs().songs].map(
                        (x) => x.youtubeLink
                    );

                    songSelector.lastPlayedSongs = songs.slice(
                        0,
                        LAST_PLAYED_SONG_QUEUE_SIZE
                    );
                    songSelector.checkLastPlayedSongs();
                    assert.strictEqual(
                        songSelector.lastPlayedSongs.length,
                        LAST_PLAYED_SONG_QUEUE_SIZE / 2 - 1
                    );

                    assert.strictEqual(
                        songSelector.lastPlayedSongs[0],
                        songs[LAST_PLAYED_SONG_QUEUE_SIZE / 2 + 1]
                    );
                });
            });
        });
    });
});

describe("checkAlternatingGender", () => {
    let songSelector: SongSelector;

    beforeEach(async () => {
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
