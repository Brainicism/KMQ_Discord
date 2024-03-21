import {
    reloadArtistAliases,
    reloadSongAliases,
} from "../../helpers/management_utils";
import { setIntersection } from "../../helpers/utils";
import assert from "assert";
import type {
    ArtistAliasCache,
    SongAliasCache,
} from "../../interfaces/worker_cache";

describe("management utils", () => {
    describe("reloadAliases", () => {
        let songAliases: SongAliasCache;
        let artistAliases: ArtistAliasCache;
        before(async () => {
            songAliases = await reloadSongAliases();
            artistAliases = await reloadArtistAliases();
        });

        describe("song aliases", () => {
            it("should add the song aliases", () => {
                const videoID = "lQaclKRINdA";
                const expectedAliases = ["It Is War", "It's War"];

                assert.deepStrictEqual(songAliases[videoID], expectedAliases);
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
                    setIntersection(artistAliases[artistName]!, expectedAliases)
                        .size === expectedAliases.length,
                );
            });
        });
    });
});
