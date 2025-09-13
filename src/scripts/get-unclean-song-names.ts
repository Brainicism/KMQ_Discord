import { IPCLogger } from "../logger.js";
import QueriedSong from "../structures/queried_song.js";
import SongSelector from "../structures/song_selector.js";
import dbContext from "../database_context.js";

const logger = new IPCLogger("get-unclean-song-names");

// eslint-disable-next-line @typescript-eslint/no-floating-promises
(async () => {
    const songs: Array<QueriedSong> = (
        await dbContext.kmq
            .selectFrom("available_songs")
            .select(SongSelector.QueriedSongFields)
            .execute()
    ).map((x) => new QueriedSong(x));

    const nonAsciiSongs = songs.filter(
        // eslint-disable-next-line no-control-regex
        (x) => !/^[\x00-\x7F’]*$/.test(x.songName.split("(")[0]!.trim()),
    );

    if (nonAsciiSongs.length) {
        logger.info(
            nonAsciiSongs
                .map((x) => `${x.youtubeLink}, ${x.songName}`)
                .join("\n"),
        );
    } else {
        logger.info("Nothing found");
    }

    await dbContext.destroy();
})();
