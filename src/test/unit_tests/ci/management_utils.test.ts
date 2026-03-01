import { reloadAliases } from "../../../helpers/management_utils.js";
import { setIntersection } from "../../../helpers/utils.js";
import State from "../../../state.js";
import assert from "assert";

describe("management utils", () => {
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
