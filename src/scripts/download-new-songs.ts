import ytdl from "ytdl-core";
import fs from "fs";
import ffmpeg from "fluent-ffmpeg";
import { QueriedSong } from "../types";
import path from "path";
import { db } from "../database_context";
import _logger from "../logger";
import { Logger } from "log4js";
const logger: Logger = _logger("download-new-songs");


export async function clearPartiallyCachedSongs() {
    logger.info("Clearing partially cached songs");
    if (!fs.existsSync(process.env.SONG_DOWNLOAD_DIR)) {
        return logger.error("Song cache directory doesn't exist.");
    }
    let files: Array<string>;
    try {
        files = await fs.promises.readdir(process.env.SONG_DOWNLOAD_DIR);
    }
    catch (err) {
        return logger.error(err);
    }

    const endingWithPartRegex = new RegExp("\\.part$");
    const partFiles = files.filter((file) => file.match(endingWithPartRegex));
    partFiles.forEach(async (partFile) => {
        try {
            await fs.promises.unlink(`${process.env.SONG_DOWNLOAD_DIR}/${partFile}`);
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
    const cachedSongLocation = path.join(process.env.SONG_DOWNLOAD_DIR, `${id}.mp3`);
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
    let deadLinksSkipped = 0;
    logger.info("Total songs in database:", songs.length);
    const songsToDownload = songs.filter(x => {
        return !fs.existsSync(path.join(process.env.SONG_DOWNLOAD_DIR, `${x.youtubeLink}.ogg`)) &&
        !fs.existsSync(path.join(process.env.SONG_DOWNLOAD_DIR, `${x.youtubeLink}.mp3`));
    });
    logger.info("Total songs to be downloaded:", songsToDownload.length);

    //update current list of non-downloaded songs
    await db.kmq.transaction(async (trx) => {
        await db.kmq("not_downloaded").del().transacting(trx);
        await db.kmq("not_downloaded").insert(songsToDownload.map(x=>({vlink: x.youtubeLink}))).transacting(trx);
    });

    for (let song of songsToDownload) {
        if (knownDeadIds.has(song.youtubeLink)) {
            deadLinksSkipped++;
            continue;
        }
        logger.info(`Downloading song: '${song.name}' by ${song.artist} | ${song.youtubeLink}`);
        try {
            await downloadSong(song.youtubeLink);
            downloadCount++;
        }
        catch (e) {
            logger.info("Error downloading song:", song.youtubeLink, e);
            deadLinksSkipped++;
            await fs.promises.unlink(`${process.env.SONG_DOWNLOAD_DIR}/${song.youtubeLink}.mp3.part`);
        }
    }

    //update list of non-downloaded songs
    const songIdsNotDownloaded = songs.filter(x => !fs.existsSync(path.join(process.env.SONG_DOWNLOAD_DIR, `${x.youtubeLink}.ogg`))).map(x => ({ vlink: x.youtubeLink }));
    await db.kmq.transaction(async (trx) => {
        await db.kmq("not_downloaded").del().transacting(trx);
        await db.kmq("not_downloaded").insert(songIdsNotDownloaded).transacting(trx);
    })
    await db.destroy();
    logger.info(`Total songs downloaded: ${downloadCount}, (${deadLinksSkipped} dead links skipped)`);
}

const convertToOpus = async () => {
    let files = await fs.promises.readdir(process.env.SONG_DOWNLOAD_DIR);

    const endingWithMp3Regex = new RegExp("\\.mp3$");
    const mp3Files = files.filter((file) => file.match(endingWithMp3Regex));
    logger.info(`Converting ${mp3Files.length} from mp3 to opus (in ogg container)`)

    for (const mp3File of mp3Files) {
        await ffmpegOpusJob(mp3File);
    }
}

const ffmpegOpusJob = async (mp3File: string) => {
    let oggFileWithPath = path.join(process.env.SONG_DOWNLOAD_DIR, `${path.basename(mp3File, ".mp3")}.ogg`);
    if (fs.existsSync(oggFileWithPath)) {
        return;
    }

    let oggPartWithPath = `${oggFileWithPath}.part`;
    let oggFfmpegOutputStream = fs.createWriteStream(oggPartWithPath);

    return new Promise((resolve, reject) => {
        ffmpeg(`${process.env.SONG_DOWNLOAD_DIR}/${mp3File}`)
            .format("opus")
            .audioCodec("libopus")
            .output(oggFfmpegOutputStream)
            .on("end", () => {
                try {
                    fs.renameSync(oggPartWithPath, oggFileWithPath);
                    logger.info("Renamed", oggPartWithPath, "to", oggFileWithPath)
                    fs.unlinkSync(path.join(process.env.SONG_DOWNLOAD_DIR, path.basename(mp3File)));
                    logger.info("Deleted", mp3File)
                    resolve();
                }
                catch (err) {
                    if (!fs.existsSync(oggFileWithPath)) {
                        logger.error(`File ${oggFileWithPath} wasn't created. Ignoring...`);
                        reject();
                        return;
                    }
                    logger.info(`File ${oggFileWithPath} might have duplicate entries in db.`)
                    reject();
                }
            })
            .on("error", (transcodingErr) => {
                throw(transcodingErr);
            })
            .run();
    })
}

const downloadAndConvertSongs = async (limit?: number) => {
    if (!fs.existsSync(process.env.SONG_DOWNLOAD_DIR)) {
        return logger.error("Song cache directory doesn't exist.");
    }

    await clearPartiallyCachedSongs();
    await downloadNewSongs(limit);
    convertToOpus();
}

export {
    downloadAndConvertSongs
}

(async () => {
    if (require.main === module) {
        const args = process.argv.slice(2);
        const limit = args.length > 0 ? parseInt(args[0]) : null;
        downloadAndConvertSongs(limit);
    }
})();
