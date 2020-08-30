import ytdl from "ytdl-core";
import fs from "fs";
import config from "../config/app_config.json";
import { QueriedSong } from "../types";
import path from "path";
import { db } from "../databases";
import _logger from "../logger";
import { Logger } from "log4js";
const logger: Logger = _logger("download-new-songs");


export async function clearPartiallyCachedSongs() {
    logger.info("Clearing partially cached songs");
    if (!fs.existsSync(config.songCacheDir)) {
        return logger.error("Song cache directory doesn't exist.");
    }
    let files: Array<string>;
    try {
        files = await fs.promises.readdir(config.songCacheDir);
    }
    catch (err) {
        return logger.error(err);
    }

    const endingWithPartRegex = new RegExp("\\.part$");
    const partFiles = files.filter((file) => file.match(endingWithPartRegex));
    partFiles.forEach(async (partFile) => {
        try {
            await fs.promises.unlink(`${config.songCacheDir}/${partFile}`);
        }
        catch (err) {
            logger.error(err);
        }
    })
    if (partFiles.length) {
        logger.info(`${partFiles.length} stale cached songs deleted.`);
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
                await db.kmq("dead_links")
                    .insert({ vlink: id, reason: `Failed to load video: error = ${playabilityStatus.reason}` });
                reject(`Failed to load video: error = ${playabilityStatus.reason}`);
                return;
            }
            //download video
            ytdl(`https://www.youtube.com/watch?v=${id}`, ytdlOptions)
                .pipe(cacheStream);
        } catch (e) {
            await db.kmq("dead_links")
                .insert({ vlink: id, reason: `Failed to retrieve video metadata. error = ${e}` });
            reject(`Failed to retrieve video metadata. error = ${e}`);
            return;
        }

        cacheStream.once('finish', async () => {
            try {
                await fs.promises.rename(tempLocation, cachedSongLocation);
                logger.info(`Downloaded song ${id} successfully`);
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
    clearPartiallyCachedSongs();

    const knownDeadIds = new Set((await db.kmq("dead_links")
        .select("vlink"))
        .map(x => x.vlink))
    let songs: Array<QueriedSong> = await db.kpopVideos("kpop_videos.app_kpop")
        .select(["nome as name", "name as artist", "vlink as youtubeLink"])
        .join("kpop_videos.app_kpop_group", function () {
            this.on("kpop_videos.app_kpop.id_artist", "=", "kpop_videos.app_kpop_group.id")
        })
        .andWhere("dead", "n")
        .andWhere("vtype", "main")
        .orderBy("kpop_videos.app_kpop.views", "DESC")

    if (limit) {
        songs = songs.slice(0, limit);
    }
    let downloadCount = 0;
    logger.info("Total songs in database: " + songs.length);
    const songsToDownload = songs.filter(x => !fs.existsSync(path.join(config.songCacheDir, `${x.youtubeLink}.mp3`)));
    logger.info("Total songs to be downloaded: " + songsToDownload.length);

    //update current list of non-downloaded songs
    await db.kmq.transaction(async (trx) => {
        await db.kmq("not_downloaded").del().transacting(trx);
        await db.kmq("not_downloaded").insert(songsToDownload.map(x=>({vlink: x.youtubeLink}))).transacting(trx);
    });

    for (let song of songsToDownload) {
        if (knownDeadIds.has(song.youtubeLink)) {
            logger.info(`Known dead link (${song.youtubeLink}), skipping...`);
            continue;
        }
        logger.info(`Downloading song: '${song.name}' by ${song.artist} | ${song.youtubeLink}`);
        try {
            await downloadSong(song.youtubeLink);
            downloadCount++;
        }
        catch (e) {
            logger.info("Error downloading song: " + e);
        }
    }

    //update list of non-downloaded songs
    const songIdsNotDownloaded = songs.filter(x => !fs.existsSync(path.join(config.songCacheDir, `${x.youtubeLink}.mp3`))).map(x => ({ vlink: x.youtubeLink }));
    await db.kmq.transaction(async (trx) => {
        await db.kmq("not_downloaded").del().transacting(trx);
        await db.kmq("not_downloaded").insert(songIdsNotDownloaded).transacting(trx);
    })
    await db.destroy();
    logger.info(`Total songs downloaded: ${downloadCount}`);
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
