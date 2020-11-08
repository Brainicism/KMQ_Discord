import ytdl from "ytdl-core";
import fs from "fs";
import ffmpeg from "fluent-ffmpeg";
import path from "path";
import { Logger } from "log4js";
import { QueriedSong } from "../types";
import _logger from "../logger";
import dbContext from "../database_context";

const logger: Logger = _logger("download-new-songs");

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
    partFiles.forEach(async (partFile) => {
        try {
            await fs.promises.unlink(`${process.env.SONG_DOWNLOAD_DIR}/${partFile}`);
        } catch (err) {
            logger.error(err);
        }
    });
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
                logger.info(`Downloaded song ${id} successfully`);
                resolve();
            } catch (err) {
                reject(new Error(`Error renaming temp song file from ${tempLocation} to ${cachedSongLocation}. err = ${err}`));
            }
        });
        cacheStream.once("error", (e) => reject(e));
    });
};

function getSongsFromDb() {
    return dbContext.kpopVideos("kpop_videos.app_kpop")
        .select(["nome as name", "name as artist", "vlink as youtubeLink"])
        .join("kpop_videos.app_kpop_group", function join() {
            this.on("kpop_videos.app_kpop.id_artist", "=", "kpop_videos.app_kpop_group.id");
        })
        .andWhere("dead", "n")
        .andWhere("vtype", "main")
        .orderBy("kpop_videos.app_kpop.views", "DESC");
}

const downloadNewSongs = async (limit?: number) => {
    let songs: Array<QueriedSong> = await getSongsFromDb();

    if (limit) {
        songs = songs.slice(0, limit);
    }
    let downloadCount = 0;
    let deadLinksSkipped = 0;
    logger.info("Total songs in database:", songs.length);
    const songsToDownload = songs.filter((x) => !fs.existsSync(path.join(process.env.SONG_DOWNLOAD_DIR, `${x.youtubeLink}.ogg`))
        && !fs.existsSync(path.join(process.env.SONG_DOWNLOAD_DIR, `${x.youtubeLink}.mp3`)));
    logger.info("Total songs to be downloaded:", songsToDownload.length);

    // update current list of non-downloaded songs
    await dbContext.kmq.transaction(async (trx) => {
        await dbContext.kmq("not_downloaded").del().transacting(trx);
        await dbContext.kmq("not_downloaded").insert(songsToDownload.map((x) => ({ vlink: x.youtubeLink }))).transacting(trx);
    });

    const knownDeadIds = new Set((await dbContext.kmq("dead_links")
        .select("vlink"))
        .map((x) => x.vlink));

    for (const song of songsToDownload) {
        if (knownDeadIds.has(song.youtubeLink)) {
            deadLinksSkipped++;
            continue;
        }
        logger.info(`Downloading song: '${song.name}' by ${song.artist} | ${song.youtubeLink}`);
        try {
            await downloadSong(song.youtubeLink);
            downloadCount++;
        } catch (e) {
            logger.info("Error downloading song:", song.youtubeLink, e);
            deadLinksSkipped++;
            await fs.promises.unlink(`${process.env.SONG_DOWNLOAD_DIR}/${song.youtubeLink}.mp3.part`);
        }
    }
    logger.info(`Total songs downloaded: ${downloadCount}, (${deadLinksSkipped} dead links skipped)`);
};

async function ffmpegOpusJob(mp3File: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const oggFileWithPath = path.join(process.env.SONG_DOWNLOAD_DIR, `${path.basename(mp3File, ".mp3")}.ogg`);
        if (fs.existsSync(oggFileWithPath)) {
            resolve();
        }
        const oggPartWithPath = `${oggFileWithPath}.part`;
        const oggFfmpegOutputStream = fs.createWriteStream(oggPartWithPath);

        logger.info(`Encoding ${mp3File} to ${path.basename(mp3File, ".mp3")}.ogg via ffmpeg...`);
        ffmpeg(`${process.env.SONG_DOWNLOAD_DIR}/${mp3File}`)
            .format("opus")
            .audioCodec("libopus")
            .audioFilters("volume=0.1")
            .output(oggFfmpegOutputStream)
            .on("end", () => {
                try {
                    fs.renameSync(oggPartWithPath, oggFileWithPath);
                    fs.unlinkSync(path.join(process.env.SONG_DOWNLOAD_DIR, path.basename(mp3File)));
                    logger.info(`Completed ffmpeg process for ${mp3File}, ${path.basename(mp3File)} → ${path.basename(mp3File, ".mp3")}.ogg`);
                    resolve();
                } catch (err) {
                    if (!fs.existsSync(oggFileWithPath)) {
                        logger.error(`File ${oggFileWithPath} wasn't created. Ignoring...`);
                        reject();
                        return;
                    }
                    logger.info(`File ${oggFileWithPath} might have duplicate entries in db.`);
                    reject();
                }
            })
            .on("error", (transcodingErr) => {
                throw (transcodingErr);
            })
            .run();
    });
}

async function convertToOpus() {
    const files = await fs.promises.readdir(process.env.SONG_DOWNLOAD_DIR);

    const endingWithMp3Regex = new RegExp("\\.mp3$");
    const mp3Files = files.filter((file) => file.match(endingWithMp3Regex));
    logger.info(`Converting ${mp3Files.length} from mp3 to opus (in ogg container)`);

    for (const mp3File of mp3Files) {
        await ffmpegOpusJob(mp3File);
    }

    const songs: Array<QueriedSong> = await getSongsFromDb();

    // update list of non-downloaded songs
    const songIdsNotDownloaded = songs.filter((x) => !fs.existsSync(path.join(process.env.SONG_DOWNLOAD_DIR, `${x.youtubeLink}.ogg`))).map((x) => ({ vlink: x.youtubeLink }));
    await dbContext.kmq.transaction(async (trx) => {
        await dbContext.kmq("not_downloaded").del().transacting(trx);
        await dbContext.kmq("not_downloaded").insert(songIdsNotDownloaded).transacting(trx);
    });
}

async function downloadAndConvertSongs(limit?: number) {
    if (!fs.existsSync(process.env.SONG_DOWNLOAD_DIR)) {
        logger.error("Song cache directory doesn't exist.");
        return;
    }

    await clearPartiallyCachedSongs();
    await downloadNewSongs(limit);
    convertToOpus();
    await dbContext.destroy();
}

export {
    downloadAndConvertSongs,
};

(async () => {
    if (require.main === module) {
        const args = process.argv.slice(2);
        const limit = args.length > 0 ? parseInt(args[0], 10) : null;
        downloadAndConvertSongs(limit);
    }
})();
