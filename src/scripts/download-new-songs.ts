import * as ytdl from "ytdl-core";
import * as fs from "fs";
import * as _config from "../../config/app_config.json";
import * as mysql from "promise-mysql";
import { QueriedSong } from "types";
import * as path from "path";
const config: any = _config;
const deadLinksFilePath = path.join(config.songCacheDir, "deadlinks.txt");

export async function clearPartiallyCachedSongs() {
    console.log("Clearing partially cached songs");
    if (!fs.existsSync(config.songCacheDir)) {
        return console.error("Song cache directory doesn't exist.");
    }
    let files: Array<string>;
    try {
        files = await fs.promises.readdir(config.songCacheDir);
    }
    catch (err) {
        return console.error(err);
    }

    const endingWithPartRegex = new RegExp("\\.part$");
    const partFiles = files.filter((file) => file.match(endingWithPartRegex));
    partFiles.forEach(async (partFile) => {
        try {
            await fs.promises.unlink(`${config.songCacheDir}/${partFile}`);
        }
        catch (err) {
            console.error(err);
        }
    })
    if (partFiles.length) {
        console.log(`${partFiles.length} stale cached songs deleted.`);
    }

}

const downloadSong = (id: string) => {
    const cachedSongLocation = path.join(config.songCacheDir, `${id}.mp3`);
    const tempLocation = `${cachedSongLocation}.part`;
    const cacheStream = fs.createWriteStream(tempLocation);
    const ytdlOptions = {
        filter: "audioonly" as const,
        quality: "highest"
    };

    return new Promise(async (resolve, reject) => {
        try {
            //check to see if the video is downloadable
            const infoResponse = await ytdl.getBasicInfo(`https://www.youtube.com/watch?v=${id}`);
            const playabilityStatus: any = infoResponse.player_response.playabilityStatus;
            if (playabilityStatus.status !== "OK") {
                fs.appendFileSync(deadLinksFilePath, `${id}: ${playabilityStatus.reason}\n`);
                reject(`Failed to load video: error = ${playabilityStatus.reason}`);
                return;
            }
            //download video
            ytdl(`https://www.youtube.com/watch?v=${id}`, ytdlOptions)
                .pipe(cacheStream);
        } catch (e) {
            fs.appendFileSync(deadLinksFilePath, `${id}: ${e}\n`);
            reject(`Failed to retrieve video metadata. error = ${e}`);
            return;
        }

        cacheStream.once('finish', async () => {
            try {
                await fs.promises.rename(tempLocation, cachedSongLocation);
                console.log(`Downloaded song ${id} successfully`);
                resolve();
            }
            catch (err) {
                reject(`Error renaming temp song file from ${tempLocation} to ${cachedSongLocation}. err = ${err}`);
            }
        })
        cacheStream.once("error", (e) => reject(e));
    })
}


const downloadNewSongs = async (limit?: number) => {
    const db = await mysql.createConnection({
        host: "localhost",
        user: config.dbUser,
        password: config.dbPassword
    });
    clearPartiallyCachedSongs();

    if (!fs.existsSync(deadLinksFilePath)) {
        fs.closeSync(fs.openSync(deadLinksFilePath, 'w'));
    }
    
    const knownDeadAndReasons = fs.readFileSync(deadLinksFilePath).toString().split("\n");
    const knownDeadIds = new Set(knownDeadAndReasons.map((x) => x.split(":")[0]));
    let query = `SELECT nome as name, name as artist, vlink as youtubeLink FROM kpop_videos.app_kpop INNER JOIN kpop_videos.app_kpop_group ON kpop_videos.app_kpop.id_artist = kpop_videos.app_kpop_group.id
    WHERE dead = "n" AND vtype = "main";`;
    if (limit) {
        query = `SELECT nome as name, name as artist, vlink as youtubeLink FROM kpop_videos.app_kpop INNER JOIN kpop_videos.app_kpop_group ON kpop_videos.app_kpop.id_artist = kpop_videos.app_kpop_group.id
        WHERE dead = "n" AND vtype = "main" ORDER BY kpop_videos.app_kpop.views DESC LIMIT ${limit};`;
    }
    const songs: Array<QueriedSong> = await db.query(query);
    let downloadCount = 0;
    console.log("total songs: " + songs.length);
    for (let song of songs) {
        if (!fs.existsSync(path.join(config.songCacheDir, `${song.youtubeLink}.mp3`))) {
            if (knownDeadIds.has(song.youtubeLink)) {
                console.log(`Known dead link (${song.youtubeLink}), skipping...`);
                continue;
            }
            console.log(`Downloading song: '${song.name}' by ${song.artist} | ${song.youtubeLink}`);
            try {
                await downloadSong(song.youtubeLink);
                downloadCount++;
            }
            catch (e) {
                console.log("Error downloading song: " + e);
            }
        }
    }
    db.destroy();
    console.log(`Total songs downloaded: ${downloadCount}`);
}

export {
    downloadNewSongs
}

(async () => {
    if (require.main === module) {
        const args = process.argv.slice(2);
        const limit = args.length > 0 ? parseInt(args[0]) : null;
        downloadNewSongs(limit);
    }
})();
