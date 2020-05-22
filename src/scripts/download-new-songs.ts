import * as ytdl from "ytdl-core";
import * as fs from "fs";
import * as _config from "../../config/app_config.json";
import * as mysql from "promise-mysql";
import { QueriedSong } from "types";
import * as path from "path";
let config: any = _config;

export function clearPartiallyCachedSongs() {
    console.log("Clearing partially cached songs");
    if (!fs.existsSync(config.songCacheDir)) {
        return console.error("Song cache directory doesn't exist.");
    }
    fs.readdir(config.songCacheDir, (error, files) => {
        if (error) {
            return console.error(error);
        }

        const endingWithPartRegex = new RegExp("\\.part$");
        const partFiles = files.filter((file) => file.match(endingWithPartRegex));
        partFiles.forEach((partFile) => {
            fs.unlink(`${config.songCacheDir}/${partFile}`, (err) => {
                if (err) {
                    console.error(err);
                }
            })
        })
        if (partFiles.length) {
            console.log(`${partFiles.length} stale cached songs deleted.`);
        }
    });
}

const downloadSong = (id: string) => {
    let cachedSongLocation = path.join(config.songCacheDir, `${id}.mp3`);
    const tempLocation = `${cachedSongLocation}.part`;
    let cacheStream = fs.createWriteStream(tempLocation);
    const ytdlOptions = {
        filter: "audioonly" as const,
        quality: "highest"
    };

    return new Promise((resolve, reject) => {
        console.log(`Downloading ${id}`)
        ytdl(`https://www.youtube.com/watch?v=${id}`, ytdlOptions)
            .pipe(cacheStream);
        cacheStream.on('finish', () => {
            fs.rename(tempLocation, cachedSongLocation, (error) => {
                if (error) {
                    reject(`Error renaming temp song file from ${tempLocation} to ${cachedSongLocation}. err = ${error}`);
                }
                else {
                    console.log(`Downloaded ${id} successfully`);
                    resolve();
                }
            });
        })
        cacheStream.on("error", (e) => reject(e));
    })
}

(async () => {
    const db = await mysql.createPool({
        connectionLimit: 10,
        host: "localhost",
        user: config.dbUser,
        password: config.dbPassword
    });
    clearPartiallyCachedSongs();
    let query = `SELECT nome as name, name as artist, vlink as youtubeLink FROM kpop_videos.app_kpop INNER JOIN kpop_videos.app_kpop_group ON kpop_videos.app_kpop.id_artist = kpop_videos.app_kpop_group.id
    WHERE dead = "n" AND vtype = "main";`;
    let songs: Array<QueriedSong> = await db.query(query);
    let downloadCount = 0;
    console.log("total songs: " + songs.length);
    for (let song of songs) {
        if (!fs.existsSync(path.join(config.songCacheDir, `${song.youtubeLink}.mp3`))) {
            console.log(`Downloading song: '${song.name}' by ${song.artist} | ${song.youtubeLink}`);
            try {
                await downloadSong(song.youtubeLink);
                downloadCount++;
            }
            catch (e) {
                console.log("error downloading song: " + e);
            }
        }
    }
    console.log(`Total songs downloaded: ${downloadCount}`);
})();
