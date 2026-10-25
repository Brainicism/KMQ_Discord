import PlaylistManager from "../../../helpers/playlist_manager";
import QueriedSong from "../../../structures/queried_song";
import assert from "assert";

const song = (
    youtubeLink: string,
    betterAudioLink: string | null = null,
): QueriedSong =>
    new QueriedSong({
        songName: youtubeLink,
        cleanSongName: youtubeLink,
        hangulSongName: null,
        artistName: "artist",
        hangulArtistName: null,
        youtubeLink,
        betterAudioLink,
        publishDate: new Date("2020-01-01"),
        members: "female",
        artistID: 1,
        isSolo: "n",
        views: 1,
        tags: "",
        vtype: "main",
    });

describe("playlist manager", () => {
    describe("sortByPlaylistPosition", () => {
        it("orders matched songs by their position in the playlist", () => {
            const sorted = PlaylistManager.sortByPlaylistPosition(
                [song("c"), song("a"), song("b")],
                ["a", "b", "c"],
            );

            assert.deepStrictEqual(
                sorted.map((x) => x.youtubeLink),
                ["a", "b", "c"],
            );
        });

        it("positions a song by its better audio link if that's what the playlist has", () => {
            const sorted = PlaylistManager.sortByPlaylistPosition(
                [song("b"), song("a", "a-audio")],
                ["a-audio", "b"],
            );

            assert.deepStrictEqual(
                sorted.map((x) => x.youtubeLink),
                ["a", "b"],
            );
        });

        it("uses a repeated video's first position", () => {
            const sorted = PlaylistManager.sortByPlaylistPosition(
                [song("b"), song("a")],
                ["b", "a", "b"],
            );

            assert.deepStrictEqual(
                sorted.map((x) => x.youtubeLink),
                ["b", "a"],
            );
        });

        it("puts songs missing from the playlist last", () => {
            const sorted = PlaylistManager.sortByPlaylistPosition(
                [song("x"), song("b"), song("a")],
                ["a", "b"],
            );

            assert.deepStrictEqual(
                sorted.map((x) => x.youtubeLink),
                ["a", "b", "x"],
            );
        });
    });
});
