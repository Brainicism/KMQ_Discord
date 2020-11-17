import mysql from "promise-mysql";
import fs from "fs";
import path from "path";
import { config } from "dotenv";
import { QueriedSong } from "../types";
import { parseJsonFile } from "../helpers/utils";

const existingSongAliases = parseJsonFile(path.resolve(__dirname, "../../data/song_aliases.json"));
config({ path: path.resolve(__dirname, "../../.env") });

(async () => {
    const db = await mysql.createPool({
        connectionLimit: 10,
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
    });
    const query = `SELECT nome as name, name as artist, vlink as youtubeLink FROM kpop_videos.app_kpop INNER JOIN kpop_videos.app_kpop_group ON kpop_videos.app_kpop.id_artist = kpop_videos.app_kpop_group.id
    WHERE dead = "n" AND vtype = "main";`;
    const songs: Array<QueriedSong> = await db.query(query);
    // eslint-disable-next-line no-control-regex
    const nonAsciiSongs = songs.filter((x) => !/^[\x00-\x7F’]*$/.test(x.name));
    const nonCheckedSongs = nonAsciiSongs.filter((x) => !(x.youtubeLink in existingSongAliases));
    fs.writeFileSync("/tmp/song_dump.txt", nonCheckedSongs.map(((x) => `${x.youtubeLink}, ${x.name}`)).join("\n"));
    // eslint-disable-next-line no-console
    console.log("Done");
    await db.end();
})();
