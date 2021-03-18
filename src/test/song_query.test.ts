import crypto from "crypto";
import assert from "assert";
import { describe } from "mocha";
import dbContext from "../database_context";
import { md5Hash } from "../helpers/utils";
import GuildPreference from "../structures/guild_preference";
import { Gender } from "../commands/game_options/gender";
import { getFilteredSongList } from "../helpers/game_utils";
import { EnvType } from "../types";
import _logger from "../logger";
import { ArtistType } from "../commands/game_options/artisttype";
import { SubunitsPreference } from "../commands/game_options/subunits";

const logger = _logger("test");

async function setup() {
    await dbContext.kmq.raw("DROP TABLE IF EXISTS available_songs");
    await dbContext.kmq.raw("DROP TABLE IF EXISTS kpop_groups");
    await dbContext.kmq.raw("DROP TABLE IF EXISTS guild_preferences");
    await dbContext.kmq.raw("CREATE TABLE available_songs LIKE kmq.available_songs");
    await dbContext.kmq.raw("CREATE TABLE kpop_groups LIKE kmq.guild_preferences");
    await dbContext.kmq.raw("CREATE TABLE IF NOT EXISTS guild_preferences LIKE kmq.guild_preferences");
    await dbContext.kmq("guild_preferences").insert({ guild_id: "test", guild_preference: JSON.stringify({}) });
}
interface MockSong {
    song_name: string,
    link: string,
    artist_name: string,
    members: string,
    views: number,
    id_artist: number,
    issolo: string,
    publishedon: Date
    id_parent_artist: number,
}

const mockArtists = [
    { id: 1, name: "A", gender: "male", solo: "n" },
    { id: 2, name: "B", gender: "male", solo: "n" },
    { id: 3, name: "C", gender: "male", solo: "n" },
    { id: 4, name: "D", gender: "male", solo: "y" },
    { id: 5, name: "E", gender: "female", solo: "n" },
    { id: 6, name: "F", gender: "female", solo: "n" },
    { id: 7, name: "G", gender: "female", solo: "n" },
    { id: 8, name: "H", gender: "female", solo: "y" },
    { id: 9, name: "I", gender: "female", solo: "y", id_parent_artist: 8 },
    { id: 10, name: "J", gender: "coed", solo: "n" },
    { id: 11, name: "K", gender: "coed", solo: "n" },
];

const mockSongs = [...Array(100).keys()].map((i) => {
    const artist = mockArtists[md5Hash(i, 8) % mockArtists.length];
    return {
        song_name: crypto.randomBytes(8).toString("hex"),
        link: crypto.randomBytes(4).toString("hex"),
        artist_name: artist.name,
        members: artist.gender,
        views: md5Hash(i, 16),
        id_artist: artist.id,
        issolo: artist.solo,
        publishedon: new Date(`${["2008", "2009", "2016", "2017", "2018"][md5Hash(i, 8) % 5]}-06-01`),
        id_parent_artist: artist.id_parent_artist || 0,
    };
});
async function getMockGuildPreference(): Promise<GuildPreference> {
    const guildPreference = new GuildPreference("test");
    await guildPreference.setSubunitPreference(SubunitsPreference.EXCLUDE);
    await guildPreference.setLimit(0, 99999);
    return guildPreference;
}

async function insertMockSongs(): Promise<Array<MockSong>> {
    for (const mockSong of mockSongs) {
        await dbContext.kmq("available_songs").insert(mockSong);
    }
    logger.info("Done inserting mock songs");
    return mockSongs;
}

describe("song query", () => {
    before(async function () {
        if (process.env.NODE_ENV !== EnvType.TEST) {
            logger.error("Must be running with NODE_ENV=EnvType.TEST");
            process.exit(1);
        }
        this.timeout(10000);
        logger.info("Setting up test database...");
        await setup();
        logger.info("Inserting mock songs...");
        await insertMockSongs();
    });

    let guildPreference: GuildPreference;
    beforeEach(async () => {
        guildPreference = await getMockGuildPreference();
    });

    describe("gender game option", () => {
        const expectedSongCounts = {
            [Gender.MALE]: mockSongs.filter((song) => song.members === "male").length,
            [Gender.FEMALE]: mockSongs.filter((song) => song.members === "female").length,
            [Gender.COED]: mockSongs.filter((song) => song.members === "coed").length,
        };

        describe("single-select gender", () => {
            it("should match the expected song count", async () => {
                for (const gender of [Gender.MALE, Gender.FEMALE, Gender.COED]) {
                    await guildPreference.setGender([gender]);
                    const { songs } = await getFilteredSongList(guildPreference);
                    assert.strictEqual(songs.length, expectedSongCounts[gender], `Gender query (${gender}) does not match with actual gender count`);
                }
            });
        });

        describe("multi-select gender", () => {
            it("should match the expected song count", async () => {
                await guildPreference.setGender([Gender.MALE, Gender.FEMALE]);
                const { songs } = await getFilteredSongList(guildPreference);
                assert.strictEqual(songs.length, expectedSongCounts[Gender.MALE] + expectedSongCounts[Gender.FEMALE]);
            });
        });
    });

    describe("gender override", () => {
        beforeEach(async () => {
            await guildPreference.setGender([Gender.ALTERNATING]);
        });

        describe("override to female", () => {
            it("should match the expected song count", async () => {
                const { songs: femaleSongs } = await getFilteredSongList(guildPreference, null, Gender.FEMALE);
                assert.ok(femaleSongs.every((song) => song.members === Gender.FEMALE));
            });
        });
        describe("override to male", () => {
            it("should match the expected song count", async () => {
                const { songs: maleSongs } = await getFilteredSongList(guildPreference, null, Gender.MALE);
                assert.ok(maleSongs.every((song) => song.members === Gender.MALE));
            });
        });
    });

    describe("ignored songs", () => {
        describe("ignoring first 10 songs", () => {
            it("should match the expected song count", async () => {
                const numIgnored = 10;
                const ignoredSongs = new Set(mockSongs.slice(0, numIgnored).map((song) => song.link));
                const { songs } = await getFilteredSongList(guildPreference, ignoredSongs);
                assert.ok(songs.length === mockSongs.length - numIgnored);
                assert.ok(songs.filter((song) => ignoredSongs.has(song.youtubeLink)).length === 0);
            });
        });
    });

    describe("groups", () => {
        const expectedSongCounts = mockArtists.reduce((map, obj) => {
            map[obj.id] = mockSongs.filter((song) => song.id_artist === obj.id).length;
            return map;
        }, {});

        beforeEach(async () => {
            await guildPreference.setGender([Gender.ALTERNATING]);
        });

        describe("single-selected group", () => {
            it("should match the expected song count", async () => {
                for (const artist of mockArtists) {
                    await guildPreference.setGroups([{ id: artist.id, name: artist.name }]);
                    const { songs } = await getFilteredSongList(guildPreference);
                    assert.strictEqual(songs.length, expectedSongCounts[artist.id]);
                }
            });
        });
        describe("multi-selected groups", () => {
            it("should match the expected song count", async () => {
                const mockArtistSubset = mockArtists.slice(0, 5);
                await guildPreference.setGroups(mockArtistSubset.map((artist) => ({ id: artist.id, name: artist.name })));
                const { songs } = await getFilteredSongList(guildPreference);
                const expectedMultiSongCount = mockArtistSubset.reduce((sum, artist) => sum + expectedSongCounts[artist.id], 0);
                assert.strictEqual(songs.length, expectedMultiSongCount);
            });
        });
    });

    describe("includes", () => {
        const expectedFemaleCount = mockSongs.filter((song) => song.members === Gender.FEMALE).length;
        const includedArtists = mockArtists.filter((artist) => artist.gender === Gender.MALE).slice(0, 2);
        const expectedIncludeCount = mockSongs.filter((song) => includedArtists.map((artist) => artist.id).includes(song.id_artist)).length;

        describe("female gender, include 2 male groups", () => {
            it("should match the expected song count", async () => {
                await guildPreference.setGender([Gender.FEMALE]);
                await guildPreference.setIncludes(includedArtists.map((artist) => ({ id: artist.id, name: artist.name })));
                const { songs } = await getFilteredSongList(guildPreference);
                assert.strictEqual(songs.length, expectedFemaleCount + expectedIncludeCount);
            });
        });
    });

    describe("excludes", () => {
        const expectedFemaleCount = mockSongs.filter((song) => song.members === Gender.FEMALE).length;
        const excludeArtists = mockArtists.filter((artist) => artist.gender === Gender.FEMALE).slice(0, 2);
        const expectedExcludeCount = mockSongs.filter((song) => excludeArtists.map((artist) => artist.id).includes(song.id_artist)).length;

        describe("female gender, exclude 2 female groups", () => {
            it("should match the expected song count", async () => {
                await guildPreference.setGender([Gender.FEMALE]);
                await guildPreference.setExcludes(excludeArtists.map((artist) => ({ id: artist.id, name: artist.name })));
                const { songs } = await getFilteredSongList(guildPreference);
                assert.strictEqual(songs.length, expectedFemaleCount - expectedExcludeCount);
            });
        });
    });

    describe("artist type", () => {
        const expectedSoloistCount = mockSongs.filter((song) => song.issolo === "y").length;
        const expectedGroupsCount = mockSongs.filter((song) => song.issolo === "n").length;

        describe("soloists", () => {
            it("should match the expected song count", async () => {
                await guildPreference.setArtistType(ArtistType.SOLOIST);
                const { songs } = await getFilteredSongList(guildPreference);
                assert.strictEqual(songs.length, expectedSoloistCount);
            });
        });

        describe("groups", () => {
            it("should match the expected song count", async () => {
                await guildPreference.setArtistType(ArtistType.GROUP);
                const { songs } = await getFilteredSongList(guildPreference);
                assert.strictEqual(songs.length, expectedGroupsCount);
            });
        });
    });

    describe("cutoff", () => {
        describe("songs in or after 2016", () => {
            it("should match the expected song count", async () => {
                const expectedSongCount = mockSongs.filter((song) => song.publishedon >= new Date("2016-01-01")).length;
                await guildPreference.setBeginningCutoffYear(2016);
                const { songs } = await getFilteredSongList(guildPreference);
                assert.strictEqual(songs.length, expectedSongCount);
            });
        });

        describe("songs in or before 2015", () => {
            it("should match the expected song count", async () => {
                const expectedSongCount = mockSongs.filter((song) => song.publishedon <= new Date("2015-12-31")).length;
                await guildPreference.setEndCutoffYear(2015);
                const { songs } = await getFilteredSongList(guildPreference);
                assert.strictEqual(songs.length, expectedSongCount);
            });
        });

        describe("songs between 2008 and 2018", () => {
            it("should match the expected song count", async () => {
                const expectedSongCount = mockSongs.filter((song) => song.publishedon >= new Date("2008-01-01") && song.publishedon <= new Date("2018-12-31")).length;
                await guildPreference.setBeginningCutoffYear(2008);
                await guildPreference.setEndCutoffYear(2018);
                const { songs } = await getFilteredSongList(guildPreference);
                assert.strictEqual(songs.length, expectedSongCount);
            });
        });

        describe("songs in 2017", () => {
            it("should match the expected song count", async () => {
                const expectedSongCount = mockSongs.filter((song) => song.publishedon >= new Date("2017-01-01") && song.publishedon <= new Date("2017-12-31")).length;
                await guildPreference.setBeginningCutoffYear(2017);
                await guildPreference.setEndCutoffYear(2017);
                const { songs } = await getFilteredSongList(guildPreference);
                assert.strictEqual(songs.length, expectedSongCount);
            });
        });
    });

    describe("subunits", () => {
        const artistWithSubunit = mockArtists[7];
        const subunitArtist = mockArtists[8];
        beforeEach(async () => {
            await guildPreference.setGroups([{ id: artistWithSubunit.id, name: artistWithSubunit.name }]);
        });

        describe("exclude subunits", () => {
            it("should match the expected song count", async () => {
                const expectedSongCount = mockSongs.filter((song) => song.id_artist === artistWithSubunit.id).length;
                await guildPreference.setSubunitPreference(SubunitsPreference.EXCLUDE);
                const { songs } = await getFilteredSongList(guildPreference);
                assert.strictEqual(songs.length, expectedSongCount);
            });
        });

        describe("include subunits", () => {
            it("should match the expected song count", async () => {
                const expectedSongCount = mockSongs.filter((song) => song.id_artist === artistWithSubunit.id || song.id_artist === subunitArtist.id).length;
                await guildPreference.setSubunitPreference(SubunitsPreference.INCLUDE);
                const { songs } = await getFilteredSongList(guildPreference);
                assert.strictEqual(songs.length, expectedSongCount);
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
                const { songs } = await getFilteredSongList(guildPreference);
                assert.strictEqual(songs.length, expectedSongCount);
            });
        });

        describe("without limit", () => {
            it("should match the expected song count", async () => {
                const expectedSongCount = mockSongs.filter((song) => song.members === Gender.COED).length;
                const { songs } = await getFilteredSongList(guildPreference);
                assert.strictEqual(songs.length, expectedSongCount);
            });
        });
    });
});

after(async () => {
    await dbContext.destroy();
});
