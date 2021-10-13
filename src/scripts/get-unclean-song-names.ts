import { QueriedSong } from "../types";
import dbContext from "../database_context";
import { IPCLogger } from "../logger";

const logger = new IPCLogger("get-unclean-song-names");

(async () => {
    const songs: Array<QueriedSong> = await dbContext.kmq("available_songs")
        .select(["song_name as songName", "artist_name as artist", "link as youtubeLink"]);

    // eslint-disable-next-line no-control-regex
    const nonAsciiSongs = songs.filter((x) => !/^[\x00-\x7F’]*$/.test(x.songName.split("(")[0].trim()));
    if (nonAsciiSongs.length) {
        logger.info(nonAsciiSongs.map(((x) => `${x.youtubeLink}, ${x.songName}`)).join("\n"));
    } else {
        logger.info("Nothing found");
    }

    await dbContext.destroy();
})();
