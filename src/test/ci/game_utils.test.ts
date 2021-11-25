import assert from "assert";
import { describe } from "mocha";
import sinon from "sinon";
import GuildPreference from "../../structures/guild_preference";
import {
    cleanupInactiveGameSessions,
    getAvailableSongCount,
    getMatchingGroupNames,
} from "../../helpers/game_utils";
import { SubunitsPreference } from "../../commands/game_options/subunits";
import { state } from "../../kmq_worker";
import GameSession from "../../structures/game_session";
import { OstPreference } from "../../commands/game_options/ost";
import { ReleaseType } from "../../commands/game_options/release";
import { mockSongs } from "../test_setup";

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
                const matchResults = await getMatchingGroupNames(["J"]);
                assert.deepStrictEqual(
                    matchResults.matchedGroups.map((x) => x.name),
                    ["J", "J + K"]
                );
                assert.strictEqual(matchResults.unmatchedGroups.length, 0);
            });
        });

        describe("fully matching group names", () => {
            it("should return the corresponding groups in matchedGroups", async () => {
                const matchResults = await getMatchingGroupNames([
                    "A",
                    "B",
                    "c",
                ]);

                assert.deepStrictEqual(
                    matchResults.matchedGroups.map((x) => x.name),
                    ["A", "B", "C"]
                );
                assert.strictEqual(matchResults.unmatchedGroups.length, 0);
            });
        });

        describe("some names in matchedGroups", () => {
            it("should return corresponding groups in unmatchedGroups/matchedGroups", async () => {
                const matchResults = await getMatchingGroupNames([
                    "A",
                    "B",
                    "LinusTechTips",
                    "Rihanna",
                ]);

                assert.deepStrictEqual(
                    matchResults.matchedGroups.map((x) => x.name),
                    ["A", "B"]
                );

                assert.deepStrictEqual(matchResults.unmatchedGroups, [
                    "LinusTechTips",
                    "Rihanna",
                ]);
            });
        });

        describe("no matching group names", () => {
            it("should return the groups in unmatchedGroups", async () => {
                const matchResults = await getMatchingGroupNames([
                    "LinusTechTips",
                    "Rihanna",
                ]);

                assert.deepStrictEqual(matchResults.matchedGroups.length, 0);
                assert.deepStrictEqual(matchResults.unmatchedGroups, [
                    "LinusTechTips",
                    "Rihanna",
                ]);
            });
        });

        describe("artist aliases", () => {
            describe("an artist name and an artist alias conflict", () => {
                it("should prefer the name matching the artist over the alias", async () => {
                    const conflictingArtistActualName = "conflictingName";
                    const conflictingName = "A";
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
                        // Artist 'A', Artist 'B' with conflicting alias 'A'
                        const conflictingArtistActualName = "B";
                        const conflictingName = "A";
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
                        // Artist 'B' matches with alias, Artist 'D' matches with non-alias (has conflicting alias with 'C')
                        const artistBAlias = "B's other name";
                        const randomArtist = "C";
                        const randomArtistConflictingAlias = "D";
                        state.aliases.artist["B"] = [artistBAlias];
                        state.aliases.artist[randomArtist] = [
                            randomArtistConflictingAlias,
                        ];
                        const matchResults = await getMatchingGroupNames([
                            artistBAlias,
                            randomArtistConflictingAlias,
                        ]);

                        assert.deepStrictEqual(
                            matchResults.matchedGroups.map((x) => x.name),
                            ["B", randomArtistConflictingAlias]
                        );

                        assert.deepStrictEqual(
                            matchResults.unmatchedGroups.length,
                            0
                        );
                    });
                });

                describe("names match exactly", () => {
                    it("should match group", async () => {
                        const artistBAlias = "B's other name";
                        state.aliases.artist["B"] = [artistBAlias];
                        const matchResults = await getMatchingGroupNames([
                            artistBAlias,
                        ]);

                        assert.deepStrictEqual(
                            matchResults.matchedGroups.map((x) => x.name),
                            ["B"]
                        );

                        assert.deepStrictEqual(
                            matchResults.unmatchedGroups.length,
                            0
                        );
                    });
                });

                describe("names match excluding punctuation", () => {
                    it("should match group", async () => {
                        const artistBAlias = "        B'sother:name!         ";
                        state.aliases.artist["B"] = [artistBAlias];
                        const matchResults = await getMatchingGroupNames([
                            artistBAlias,
                        ]);

                        assert.deepStrictEqual(
                            matchResults.matchedGroups.map((x) => x.name),
                            ["B"]
                        );

                        assert.deepStrictEqual(
                            matchResults.unmatchedGroups.length,
                            0
                        );
                    });
                });

                describe("one alias match, one non-match", () => {
                    it("should have one match, and one non-match", async () => {
                        const artistBAlias = "        B'sother:name!         ";
                        state.aliases.artist["B"] = [artistBAlias];
                        const nonMatchArtist = "Weee";
                        const matchResults = await getMatchingGroupNames([
                            artistBAlias,
                            nonMatchArtist,
                        ]);

                        assert.deepStrictEqual(
                            matchResults.matchedGroups.map((x) => x.name),
                            ["B"]
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
            assert.strictEqual(songCount.countBeforeLimit, mockSongs.length);
        });
    });

    describe("cleanupInactiveGameSessions", () => {
        const guildId = "123";
        const gameSession = new GameSession(null, null, guildId, null, null);
        const sandbox = sinon.createSandbox();
        const endSessionStub = sandbox.stub(gameSession, "endSession");
        after(() => {
            sandbox.restore();
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
