import { IPCLogger } from "../logger";
import SongSelector from "../structures/song_selector";
import dbContext from "../database_context";
import type QueriedSong from "../interfaces/queried_song";

const logger = new IPCLogger("get-unclean-song-names");

// eslint-disable-next-line @typescript-eslint/no-floating-promises
(async () => {
    const songs: Array<QueriedSong> = await dbContext.kmq
        .selectFrom("available_songs")
        .select(SongSelector.QueriedSongFields)
        .execute();

    const nonAsciiSongs = songs.filter(
        // eslint-disable-next-line no-control-regex
        (x) => !/^[\x00-\x7F’]*$/.test(x.songName.split("(")[0].trim()),
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
