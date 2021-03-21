import ytdl from "ytdl-core";
import fs from "fs";
import ffmpeg from "fluent-ffmpeg";
import path from "path";
import { Logger } from "log4js";
import { exec } from "child_process";
import { QueriedSong } from "../types";
import _logger from "../logger";
import dbContext from "../database_context";
import { generateKmqDataTables } from "../seed/bootstrap";
import { retryJob } from "../helpers/utils";

const logger: Logger = _logger("download-new-songs");
const TARGET_AVERAGE_VOLUME = -30;
export async function clearPartiallyCachedSongs(): Promise<void> {
    logger.info("Clearing partially cached songs");
    if (!fs.existsSync(process.env.SONG_DOWNLOAD_DIR)) {
        logger.error("Song cache directory doesn't exist.");
        return;
    }
    let files: Array<string>;
    try {
        files = await fs.promises.readdir(process.env.SONG_DOWNLOAD_DIR);
    } catch (err) {
        logger.error(err);
        return;
    }

    const endingWithPartRegex = new RegExp("\\.part$");
    const partFiles = files.filter((file) => file.match(endingWithPartRegex));
    for (const partFile of partFiles) {
        try {
            await fs.promises.unlink(`${process.env.SONG_DOWNLOAD_DIR}/${partFile}`);
        } catch (err) {
            logger.error(err);
        }
    }
    if (partFiles.length) {
        logger.info(`${partFiles.length} stale cached songs deleted.`);
    }
}

function getAverageVolume(mp3File: string): Promise<number> {
    return new Promise((resolve, reject) => {
        exec(`ffmpeg -i "${mp3File}" -af 'volumedetect' -f null /dev/null 2>&1 | grep mean_volume | awk -F': ' '{print $2}' | cut -d' ' -f1;`, (err, stdout, stderr) => {
            if (!stdout || stderr) {
                logger.error(`Error getting average volume: path = ${mp3File}, err = ${stderr}`);
                reject();
                return;
            }
            resolve(parseFloat(stdout));
        });
    });
}

async function ffmpegOpusJob(id: string): Promise<void> {
    const mp3File = path.join(process.env.SONG_DOWNLOAD_DIR, `${id}.mp3`);
    return new Promise(async (resolve, reject) => {
        const oggFileWithPath = mp3File.replace(".mp3", ".ogg");
        if (fs.existsSync(oggFileWithPath)) {
            resolve();
        }
        const oggPartWithPath = `${oggFileWithPath}.part`;
        const oggFfmpegOutputStream = fs.createWriteStream(oggPartWithPath);

        const currentAverageVolume = await getAverageVolume(mp3File);
        const volumeDifferential = TARGET_AVERAGE_VOLUME - currentAverageVolume;
        ffmpeg(mp3File)
            .renice(20)
            .format("opus")
            .audioCodec("libopus")
            .audioFilters(`volume=${volumeDifferential}dB`)
            .output(oggFfmpegOutputStream)
            .on("end", () => {
                try {
                    fs.renameSync(oggPartWithPath, oggFileWithPath);
                    fs.unlinkSync(path.join(process.env.SONG_DOWNLOAD_DIR, path.basename(mp3File)));
                    resolve();
                } catch (err) {
                    if (!fs.existsSync(oggFileWithPath)) {
                        reject(new Error(`File ${oggFileWithPath} wasn't created. err = ${err}`));
                    }
                    reject(new Error(`File ${oggFileWithPath} might have duplicate entries in db. err = ${err}`));
                }
            })
            .on("error", (transcodingErr) => {
                reject(transcodingErr);
            })
            .run();
    });
}
const downloadSong = (id: string): Promise<void> => {
    const cachedSongLocation = path.join(process.env.SONG_DOWNLOAD_DIR, `${id}.mp3`);
    const tempLocation = `${cachedSongLocation}.part`;
    const cacheStream = fs.createWriteStream(tempLocation);
    const ytdlOptions = {
        filter: "audioonly" as const,
        quality: "highest",
    };

    return new Promise(async (resolve, reject) => {
        try {
            // check to see if the video is downloadable
            const infoResponse = await ytdl.getBasicInfo(`https://www.youtube.com/watch?v=${id}`);
            const { playabilityStatus }: any = infoResponse.player_response;
            if (playabilityStatus.status !== "OK") {
                await dbContext.kmq("dead_links")
                    .insert({ vlink: id, reason: `Failed to load video: error = ${playabilityStatus.reason}` });
                reject(new Error(`Failed to load video: error = ${playabilityStatus.reason}`));
                return;
            }
            // download video
            ytdl(`https://www.youtube.com/watch?v=${id}`, ytdlOptions)
                .pipe(cacheStream);
        } catch (e) {
            await dbContext.kmq("dead_links")
                .insert({ vlink: id, reason: `Failed to retrieve video metadata. error = ${e}` });
            reject(new Error(`Failed to retrieve video metadata. error = ${e}`));
            return;
        }

        cacheStream.once("finish", async () => {
            try {
                await fs.promises.rename(tempLocation, cachedSongLocation);
                resolve();
            } catch (err) {
                reject(new Error(`Error renaming temp song file from ${tempLocation} to ${cachedSongLocation}. err = ${err}`));
            }
        });
        cacheStream.once("error", (e) => reject(e));
    });
};

async function getSongsFromDb() {
    return dbContext.kpopVideos("kpop_videos.app_kpop")
        .select(["nome as name", "name as artist", "vlink as youtubeLink"])
        .join("kpop_videos.app_kpop_group", function join() {
            this.on("kpop_videos.app_kpop.id_artist", "=", "kpop_videos.app_kpop_group.id");
        })
        .andWhere("dead", "n")
        .andWhere("vtype", "main")
        .orderBy("kpop_videos.app_kpop.views", "DESC");
}

async function updateNotDownloaded(songs: Array<QueriedSong>) {
    // update list of non-downloaded songs
    const songIDsNotDownloaded = songs.filter((x) => !fs.existsSync(path.join(process.env.SONG_DOWNLOAD_DIR, `${x.youtubeLink}.ogg`))).map((x) => ({ vlink: x.youtubeLink }));
    await dbContext.kmq.transaction(async (trx) => {
        await dbContext.kmq("not_downloaded").del().transacting(trx);
        await dbContext.kmq("not_downloaded").insert(songIDsNotDownloaded).transacting(trx);
    });
}

const downloadNewSongs = async (limit?: number) => {
    const allSongs: Array<QueriedSong> = await getSongsFromDb();
    let songsToDownload = limit ? allSongs.slice(0, limit) : allSongs.slice();
    let downloadCount = 0;
    let deadLinksSkipped = 0;
    logger.info("Total songs in database:", allSongs.length);
    songsToDownload = songsToDownload.filter((x) => !fs.existsSync(path.join(process.env.SONG_DOWNLOAD_DIR, `${x.youtubeLink}.ogg`)));
    logger.info("Total songs to be downloaded:", songsToDownload.length);

    // update current list of non-downloaded songs
    await updateNotDownloaded(allSongs);

    const knownDeadIDs = new Set((await dbContext.kmq("dead_links")
        .select("vlink"))
        .map((x) => x.vlink));

    for (const song of songsToDownload) {
        if (knownDeadIDs.has(song.youtubeLink)) {
            deadLinksSkipped++;
            continue;
        }

        logger.info(`Downloading song: '${song.name}' by ${song.artist} | ${song.youtubeLink} (${downloadCount + 1}/${songsToDownload.length})`);
        try {
            await retryJob(downloadSong, [song.youtubeLink], 1, true, 5000);
        } catch (err) {
            logger.error(`Error downloading song ${song.youtubeLink}, skipping... err = ${err}`);
            deadLinksSkipped++;
            try {
                await fs.promises.unlink(`${process.env.SONG_DOWNLOAD_DIR}/${song.youtubeLink}.mp3.part`);
            } catch (tempErr) {
                logger.error(`Error deleting temp file ${song.youtubeLink}.mp3.part, err = ${tempErr}`);
            }
            continue;
        }

        logger.info(`Encoding song: '${song.name}' by ${song.artist} | ${song.youtubeLink}`);
        try {
            await retryJob(ffmpegOpusJob, [song.youtubeLink], 1, true, 5000);
        } catch (err) {
            logger.error(`Error encoding song ${song.youtubeLink}, exiting... err = ${err}`);
            break;
        }
        downloadCount++;
    }

    // update final list of non-downloaded songs
    await updateNotDownloaded(allSongs);
    logger.info(`Total songs downloaded: ${downloadCount}, (${deadLinksSkipped} dead links skipped)`);
};

export async function downloadAndConvertSongs(limit?: number) {
    if (!fs.existsSync(process.env.SONG_DOWNLOAD_DIR)) {
        logger.error("Song cache directory doesn't exist.");
        return;
    }

    await clearPartiallyCachedSongs();
    await downloadNewSongs(limit);
    generateKmqDataTables();
}
