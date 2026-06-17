import {
    reloadAliases,
    reloadArtists,
} from "../../../helpers/management_utils";
import { setIntersection } from "../../../helpers/utils";
import State from "../../../state";
import assert from "assert";

describe("management utils", () => {
    describe("reloadArtists", () => {
        before(async () => {
            await reloadArtists();
        });

        it("populates the artist-ID cache", () => {
            assert.ok(State.artistIDToEntry.size > 0);
        });

        it("keeps the ID cache consistent with the name/alias map", () => {
            // Every entry reachable by name/alias must be reachable by its ID,
            // and resolve to the same object (this is what resolveArtistIDs
            // relies on instead of rebuilding the map per call).
            for (const entry of Object.values(State.artistToEntry)) {
                const byID = State.artistIDToEntry.get(entry.id);
                assert.strictEqual(
                    byID,
                    entry,
                    `artist id ${entry.id} (${entry.name}) missing or mismatched in artistIDToEntry`,
                );
            }
        });

        it("keys every entry by its own ID", () => {
            // The map is internally consistent: each key equals its value's id.
            for (const [id, entry] of State.artistIDToEntry) {
                assert.strictEqual(entry.id, id);
            }
        });

        it("is at least as complete as the name/alias map", () => {
            // It can be strictly larger: when two artists share a name/alias,
            // the later overwrites the former in artistToEntry, but each row's
            // id is still recorded here.
            const distinctIDs = new Set(
                Object.values(State.artistToEntry).map((e) => e.id),
            );

            assert.ok(State.artistIDToEntry.size >= distinctIDs.size);
        });

        it("clears stale entries on reload", async () => {
            const sentinelID = -987654321;
            State.artistIDToEntry.set(sentinelID, {
                id: sentinelID,
                name: "sentinel",
            } as any);

            await reloadArtists();
            assert.strictEqual(
                State.artistIDToEntry.has(sentinelID),
                false,
                "reloadArtists should clear the ID cache before repopulating",
            );
        });
    });

    describe("reloadAliases", () => {
        before(async () => {
            await reloadAliases();
        });

        describe("song aliases", () => {
            it("should add the song aliases", () => {
                const videoID = "Bsiv1mo0HTQ";
                const expectedAliases = ["It Is War", "It's War"];

                assert.deepStrictEqual(
                    State.aliases.song[videoID],
                    expectedAliases,
                );
            });
        });

        describe("artist aliases", () => {
            it("should add the artist aliases", () => {
                const artistName = "Lee Sujeong";
                const regularAlias = "이수정";
                const previousEnglishName = "BabySoul";
                const previousKoreanName = "베이비소울";
                const expectedAliases = [
                    regularAlias,
                    previousEnglishName,
                    previousKoreanName,
                ];

                assert.ok(
                    setIntersection(
                        State.aliases.artist[artistName]!,
                        expectedAliases,
                    ).size === expectedAliases.length,
                );
            });
        });
    });
});
