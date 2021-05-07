import { QueriedSong } from "../types";
import dbContext from "../database_context";
import _logger from "../logger";

const logger = _logger("get-unclean-song-names");

(async () => {
    const songs: Array<QueriedSong> = await dbContext.kmq("available_songs")
        .select(["song_name as name", "artist_name as artist", "link as youtubeLink"]);
    // eslint-disable-next-line no-control-regex
    const nonAsciiSongs = songs.filter((x) => !/^[\x00-\x7F’]*$/.test(x.name.split("(")[0].trim()));
    if (nonAsciiSongs.length) {
        logger.info(nonAsciiSongs.map(((x) => `${x.youtubeLink}, ${x.name}`)).join("\n"));
    } else {
        logger.info("Nothing found");
    }

    await dbContext.destroy();
})();
