import { reloadAliases } from "../../helpers/management_utils";
import { setIntersection } from "../../helpers/utils";
import State from "../../state";
import assert from "assert";

describe("management utils", () => {
    describe("reloadAliases", () => {
        before(async () => {
            await reloadAliases();
        });

        describe("song aliases", () => {
            it("should add the song aliases", () => {
                const videoID = "lQaclKRINdA";
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
