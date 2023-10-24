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
                const videoID = "0rtV5esQT6I";
                const expectedAliases = [
                    "Like OOH AHH",
                    "Like OOH-AHH",
                    "OOH AHH하게",
                    "우아하게",
                ];

                assert.ok(
                    setIntersection(
                        State.aliases.song[videoID],
                        expectedAliases,
                    ).size === expectedAliases.length,
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
                        State.aliases.artist[artistName],
                        expectedAliases,
                    ).size === expectedAliases.length,
                );
            });
        });
    });
});
