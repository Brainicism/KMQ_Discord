import mysql from "promise-mysql";
import config from "../config/app_config.json";
import { QueriedSong } from "../types";
import fs from "fs";
import existingSongAliases from "../../data/song_aliases.json";

(async () => {
    const db = await mysql.createPool({
        connectionLimit: 10,
        host: "localhost",
        user: config.dbUser,
        password: config.dbPassword
    });
    const query = `SELECT nome as name, name as artist, vlink as youtubeLink FROM kpop_videos.app_kpop INNER JOIN kpop_videos.app_kpop_group ON kpop_videos.app_kpop.id_artist = kpop_videos.app_kpop_group.id
    WHERE dead = "n" AND vtype = "main";`;
    const songs: Array<QueriedSong> = await db.query(query);
    const nonAsciiSongs = songs.filter(x => !/^[\x00-\x7F’]*$/.test(x.name));
    const nonCheckedSongs = nonAsciiSongs.filter(x => !(x.youtubeLink in existingSongAliases));
    fs.writeFileSync("./tmp/song_dump.txt", nonCheckedSongs.map((x => `${x.youtubeLink}, ${x.name}`)).join("\n"));
    console.log("Done");
    db.release();
})();
