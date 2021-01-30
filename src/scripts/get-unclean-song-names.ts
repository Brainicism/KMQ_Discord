import path from "path";
import { config } from "dotenv";
import { QueriedSong } from "../types";
import { parseJsonFile } from "../helpers/utils";
import dbContext from "../database_context";
import _logger from "../logger";

const logger = _logger("get-unclean-song-names");
const existingSongAliases = parseJsonFile(path.resolve(__dirname, "../../data/song_aliases.json"));
config({ path: path.resolve(__dirname, "../../.env") });

(async () => {
    const songs: Array<QueriedSong> = await dbContext.kmq("available_songs")
        .select(["song_name as name", "artist_name as artist", "link as youtubeLink"]);
    // eslint-disable-next-line no-control-regex
    const nonAsciiSongs = songs.filter((x) => !/^[\x00-\x7F’]*$/.test(x.name.split("(")[0].trim()));
    const nonCheckedSongs = nonAsciiSongs.filter((x) => !(x.youtubeLink in existingSongAliases));
    // eslint-disable-next-line no-console
    if (nonCheckedSongs.length) {
        logger.info(nonCheckedSongs.map(((x) => `${x.youtubeLink}, ${x.name}`)).join("\n"));
    } else {
        logger.info("Nothing found");
    }

    await dbContext.destroy();
})();
