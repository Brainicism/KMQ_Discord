import assert from "assert";
import { describe } from "mocha";
import sinon from "sinon";

import { OstPreference } from "../../commands/game_options/ost";
import { ReleaseType } from "../../commands/game_options/release";
import { SubunitsPreference } from "../../commands/game_options/subunits";
import * as discordUtils from "../../helpers/discord_utils";
import {
    cleanupInactiveGameSessions,
    getAvailableSongCount,
    getMatchingGroupNames,
} from "../../helpers/game_utils";
import { state } from "../../kmq_worker";
import GameSession from "../../structures/game_session";
import GuildPreference from "../../structures/guild_preference";

const sandbox = sinon.createSandbox();

async function getMockGuildPreference(): Promise<GuildPreference> {
    const guildPreference = new GuildPreference("test");
    sinon.stub(guildPreference, "updateGuildPreferences");
    await guildPreference.setSubunitPreference(SubunitsPreference.EXCLUDE);
    await guildPreference.setLimit(0, 99999);
    await guildPreference.setOstPreference(OstPreference.INCLUDE);
    await guildPreference.setReleaseType(ReleaseType.ALL);
    return guildPreference;
}

describe("song query", () => {
    let guildPreference: GuildPreference;
    beforeEach(async () => {
        guildPreference = await getMockGuildPreference();
    });

    describe("getMatchingGroupNames", () => {
        describe("collabs", () => {
            it("should return the group and any collabs they are a part of in matchedGroups", async () => {
                const artistName = "IU";
                const matchResults = await getMatchingGroupNames([artistName]);

                // first result is exact artist match
                assert.strictEqual(
                    matchResults.matchedGroups[0].name,
                    artistName
                );

                assert.strictEqual(matchResults.matchedGroups.length > 1, true);

                // all results (including collabs) include the artist
                assert.deepStrictEqual(
                    matchResults.matchedGroups
                        .map((x) =>
                            x.name
                                .split("+")
                                .some((y) => y.trim() === artistName)
                        )
                        .every((z) => z),
                    true
                );

                assert.strictEqual(matchResults.unmatchedGroups.length, 0);
            });
        });

        describe("fully matching group names", () => {
            it("should return the corresponding groups in matchedGroups", async () => {
                const artistNames = ["Blackpink", "BTS", "Stray Kids"];
                const matchResults = await getMatchingGroupNames([
                    artistNames[0],
                    artistNames[1],
                    artistNames[2].toLowerCase(),
                ]);

                assert.deepStrictEqual(
                    matchResults.matchedGroups.map((x) => x.name),
                    artistNames
                );
                assert.strictEqual(matchResults.unmatchedGroups.length, 0);
            });
        });

        describe("some names in matchedGroups", () => {
            it("should return corresponding groups in unmatchedGroups/matchedGroups", async () => {
                const artistNames = ["Blackpink", "BTS", "Stray Kids"];
                const fakeNames = ["LinusTechTips", "Rihanna"];
                const matchResults = await getMatchingGroupNames([
                    ...artistNames,
                    ...fakeNames,
                ]);

                assert.deepStrictEqual(
                    matchResults.matchedGroups.map((x) => x.name),
                    artistNames
                );

                assert.deepStrictEqual(matchResults.unmatchedGroups, fakeNames);
            });
        });

        describe("no matching group names", () => {
            it("should return the groups in unmatchedGroups", async () => {
                const fakeNames = ["LinusTechTips", "Rihanna"];

                const matchResults = await getMatchingGroupNames(fakeNames);

                assert.deepStrictEqual(matchResults.matchedGroups.length, 0);
                assert.deepStrictEqual(matchResults.unmatchedGroups, fakeNames);
            });
        });

        describe("artist aliases", () => {
            describe("an artist name and an artist alias conflict", () => {
                it("should prefer the name matching the artist over the alias", async () => {
                    // exact 'WANNA.B' guess should be prioritized over hypothetical alias of 'Super Five' to 'WANNA.B'
                    const conflictingArtistActualName = "Super Five";
                    const conflictingName = "WANNA.B";
                    state.aliases.artist[conflictingArtistActualName] = [
                        conflictingName,
                    ];
                    const matchResults = await getMatchingGroupNames([
                        conflictingName,
                    ]);

                    assert.deepStrictEqual(
                        matchResults.matchedGroups.map((x) => x.name),
                        [conflictingName]
                    );

                    assert.deepStrictEqual(
                        matchResults.unmatchedGroups.length,
                        0
                    );
                });
            });

            describe("no alias is specified", () => {
                it("should not match any groups", async () => {
                    state.aliases.artist = {};
                    const artistBAlias = "B's other name";
                    const matchResults = await getMatchingGroupNames([
                        artistBAlias,
                    ]);

                    assert.deepStrictEqual(
                        matchResults.matchedGroups.length,
                        0
                    );

                    assert.deepStrictEqual(matchResults.unmatchedGroups, [
                        artistBAlias,
                    ]);
                });
            });

            describe("alias is specified", () => {
                beforeEach(() => {
                    state.aliases.artist = {};
                });

                describe("an artist name and an artist alias conflict", () => {
                    it("should prefer the name matching the artist over the alias", async () => {
                        // Artist '2YOON', Artist '2PM' with hypothetical conflicting alias '2YOON'
                        const conflictingArtistActualName = "2PM";
                        const conflictingName = "2YOON";
                        state.aliases.artist[conflictingArtistActualName] = [
                            conflictingName,
                        ];
                        const matchResults = await getMatchingGroupNames([
                            conflictingName,
                        ]);

                        assert.deepStrictEqual(
                            matchResults.matchedGroups.map((x) => x.name),
                            [conflictingName]
                        );

                        assert.deepStrictEqual(
                            matchResults.unmatchedGroups.length,
                            0
                        );
                    });
                });

                describe("one alias match, one non-alias match", () => {
                    it("should not try to alias the non-alias match", async () => {
                        // Artist 'Hyuk' matches with alias, Artist 'REDSQUARE' matches with non-alias
                        const artistNameAliasMatch = "Hyuk";
                        const artistNameAlias = "Hyuk ALIAS";
                        const artistNameExactMatch = "REDSQUARE";
                        state.aliases.artist[artistNameAliasMatch] = [
                            artistNameAlias,
                        ];

                        const matchResults = await getMatchingGroupNames([
                            artistNameAlias,
                            artistNameExactMatch,
                        ]);

                        assert.deepStrictEqual(
                            matchResults.matchedGroups.map((x) => x.name),
                            [artistNameAliasMatch, artistNameExactMatch]
                        );

                        assert.deepStrictEqual(
                            matchResults.unmatchedGroups.length,
                            0
                        );
                    });
                });

                describe("names match exactly", () => {
                    it("should match group", async () => {
                        const artistName = "Blackpink";
                        const artistBAlias = "Blackpink alias";
                        state.aliases.artist["Blackpink"] = [artistBAlias];
                        const matchResults = await getMatchingGroupNames([
                            artistBAlias,
                        ]);

                        assert.deepStrictEqual(
                            matchResults.matchedGroups.map((x) => x.name),
                            [artistName]
                        );

                        assert.deepStrictEqual(
                            matchResults.unmatchedGroups.length,
                            0
                        );
                    });
                });

                describe("alias match", () => {
                    it("should match group", async () => {
                        const artistName = "Girl's Day";
                        const artistNameAlias = "Girl's Day Alias";
                        state.aliases.artist[artistName] = [artistNameAlias];
                        const matchResults = await getMatchingGroupNames([
                            artistNameAlias,
                        ]);

                        assert.deepStrictEqual(
                            matchResults.matchedGroups.map((x) => x.name),
                            [artistName]
                        );

                        assert.deepStrictEqual(
                            matchResults.unmatchedGroups.length,
                            0
                        );
                    });
                });

                describe("one alias match, one non-match", () => {
                    it("should have one match, and one non-match", async () => {
                        const artistName = "Eunbi";
                        const artistAlias = "Eunbi alias";
                        state.aliases.artist[artistName] = [artistAlias];
                        const nonMatchArtist = "Weee";
                        const matchResults = await getMatchingGroupNames([
                            artistAlias,
                            nonMatchArtist,
                        ]);

                        assert.deepStrictEqual(
                            matchResults.matchedGroups.map((x) => x.name),
                            [artistName]
                        );

                        assert.deepStrictEqual(matchResults.unmatchedGroups, [
                            nonMatchArtist,
                        ]);
                    });
                });
            });
        });
    });

    describe("getSongCount", () => {
        it("should return the expected song count", async () => {
            const limit = 50;
            await guildPreference.setLimit(0, limit);
            const songCount = await getAvailableSongCount(guildPreference);
            assert.strictEqual(songCount.count, limit);
            assert.strictEqual(songCount.countBeforeLimit > 0, true);
        });
    });

    describe("cleanupInactiveGameSessions", () => {
        const guildId = "123";
        sandbox
            .stub(discordUtils, "getCurrentVoiceMembers")
            .callsFake((_voiceChannelID) => []);
        const gameSession = new GameSession(null, null, guildId, null, null);
        sandbox.restore();
        const endSandbox = sinon.createSandbox();
        const endSessionStub = sandbox.stub(gameSession, "endSession");
        after(() => {
            endSandbox.restore();
        });

        state.gameSessions = {
            [guildId]: gameSession,
        };

        describe("no inactive gamesessions", () => {
            it("should not clean up", async () => {
                await cleanupInactiveGameSessions();
                assert.strictEqual(state.gameSessions[guildId], gameSession);
                sinon.assert.notCalled(endSessionStub);
            });
        });

        describe("has inactive gamesessions", () => {
            it("should clean up", async () => {
                gameSession.lastActive = Date.now() - 1000 * 60 * 60;
                await cleanupInactiveGameSessions();
                sinon.assert.called(endSessionStub);
            });
        });
    });
});
