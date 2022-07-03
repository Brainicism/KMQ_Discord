import { IPCLogger } from "../logger";
import { exec } from "child_process";
import {
    getAudioDurationInSeconds,
    pathExists,
    retryJob,
} from "../helpers/utils";
import { getNewConnection } from "../database_context";
import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import path from "path";
import ytdl from "ytdl-core";
import type { DatabaseContext } from "../database_context";
import type QueriedSong from "../interfaces/queried_song";

const logger = new IPCLogger("download-new-songs");
const TARGET_AVERAGE_VOLUME = -30;

async function clearPartiallyCachedSongs(): Promise<void> {
    logger.info("Clearing partially cached songs");
    if (!(await pathExists(process.env.SONG_DOWNLOAD_DIR))) {
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

    const endingWithPartRegex = /\.part$/;
    const partFiles = files.filter((file) => file.match(endingWithPartRegex));

    await Promise.allSettled(
        partFiles.map(async (partFile) => {
            try {
                await fs.promises.unlink(
                    `${process.env.SONG_DOWNLOAD_DIR}/${partFile}`
                );
            } catch (err) {
                logger.error(err);
            }
        })
    );

    if (partFiles.length) {
        logger.info(`${partFiles.length} stale cached songs deleted.`);
    }
}

function getAverageVolume(mp3File: string): Promise<number> {
    return new Promise((resolve, reject) => {
        exec(
            `ffmpeg -i "${mp3File}" -af 'volumedetect' -f null /dev/null 2>&1 | grep mean_volume | awk -F': ' '{print $2}' | cut -d' ' -f1;`,
            (err, stdout, stderr) => {
                if (!stdout || stderr) {
                    logger.error(
                        `Error getting average volume: path = ${mp3File}, err = ${stderr}`
                    );
                    reject();
                    return;
                }

                resolve(parseFloat(stdout));
            }
        );
    });
}

async function ffmpegOpusJob(id: string): Promise<void> {
    const mp3File = path.join(process.env.SONG_DOWNLOAD_DIR, `${id}.mp3`);
    return new Promise(async (resolve, reject) => {
        const oggFileWithPath = mp3File.replace(".mp3", ".ogg");
        if (await pathExists(oggFileWithPath)) {
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
            .on("end", async () => {
                try {
                    await fs.promises.rename(oggPartWithPath, oggFileWithPath);
                    await fs.promises.unlink(
                        path.join(
                            process.env.SONG_DOWNLOAD_DIR,
                            path.basename(mp3File)
                        )
                    );
                    resolve();
                } catch (err) {
                    if (!(await pathExists(oggFileWithPath))) {
                        reject(
                            new Error(
                                `File ${oggFileWithPath} wasn't created. err = ${err}`
                            )
                        );
                    }

                    reject(
                        new Error(
                            `File ${oggFileWithPath} might have duplicate entries in db. err = ${err}`
                        )
                    );
                }
            })
            .on("error", (transcodingErr) => {
                reject(transcodingErr);
            })
            .run();
    });
}

const downloadSong = (db: DatabaseContext, id: string): Promise<void> => {
    const cachedSongLocation = path.join(
        process.env.SONG_DOWNLOAD_DIR,
        `${id}.mp3`
    );

    const tempLocation = `${cachedSongLocation}.part`;
    const cacheStream = fs.createWriteStream(tempLocation);
    const ytdlOptions = {
        filter: "audioonly" as const,
        quality: "highest",
    };

    return new Promise(async (resolve, reject) => {
        try {
            // check to see if the video is downloadable
            const infoResponse = await ytdl.getBasicInfo(
                `https://www.youtube.com/watch?v=${id}`
            );

            const { playabilityStatus }: any = infoResponse.player_response;
            if (playabilityStatus.status !== "OK") {
                await db
                    .kmq("dead_links")
                    .insert({
                        vlink: id,
                        reason: `Failed to load video: error = ${playabilityStatus.reason}`,
                    })
                    .onConflict("vlink")
                    .ignore();

                reject(
                    new Error(
                        `Failed to load video: error = ${playabilityStatus.reason}`
                    )
                );
                return;
            }

            // download video
            ytdl(`https://www.youtube.com/watch?v=${id}`, ytdlOptions).pipe(
                cacheStream
            );
        } catch (e) {
            const errorMessage = `Failed to retrieve video metadata for '${id}'. error = ${e}`;
            await db
                .kmq("dead_links")
                .insert({
                    vlink: id,
                    reason: errorMessage,
                })
                .onConflict("vlink")
                .ignore();

            reject(new Error(errorMessage));
            return;
        }

        cacheStream.once("finish", async () => {
            try {
                await fs.promises.rename(tempLocation, cachedSongLocation);
                const duration = await getAudioDurationInSeconds(
                    cachedSongLocation
                );

                await db
                    .kmq("cached_song_duration")
                    .insert({ vlink: id, duration })
                    .onConflict(["vlink"])
                    .merge();
                resolve();
            } catch (err) {
                reject(
                    new Error(
                        `Error renaming temp song file from ${tempLocation} to ${cachedSongLocation}. err = ${err}`
                    )
                );
            }
        });
        cacheStream.once("error", (e) => reject(e));
    });
};

async function getSongsFromDb(db: DatabaseContext): Promise<any> {
    return db.kpopVideos
        .with(
            "rankedAudioSongs",
            db.kpopVideos
                .select([
                    "app_kpop_audio.name AS songName",
                    "app_kpop_group.name AS artistName",
                    "vlink AS youtubeLink",
                    "app_kpop_audio.views AS views",
                    "app_kpop_audio.tags AS tags",
                    db.kpopVideos.raw(
                        "RANK() OVER(PARTITION BY app_kpop_audio.id_artist ORDER BY views DESC) AS rank"
                    ),
                ])
                .from("app_kpop_audio")
                .join(
                    "app_kpop_group",
                    "kpop_videos.app_kpop_audio.id_artist",
                    "=",
                    "kpop_videos.app_kpop_group.id"
                )
                .whereNotIn("vlink", function () {
                    this.select("vlink").from("kmq.dead_links");
                })
                .andWhere("tags", "NOT LIKE", "%c%")
        )
        .select("songName", "artistName", "youtubeLink", "views")
        .from("rankedAudioSongs")
        .where("rank", "<=", process.env.PREMIUM_AUDIO_SONGS_PER_ARTIST)
        .union(function () {
            this.select(
                "app_kpop.name AS songName",
                "app_kpop_group.name AS artistName",
                "vlink AS youtubeLink",
                "app_kpop.views AS views"
            )
                .from("app_kpop")
                .join(
                    "kpop_videos.app_kpop_group",
                    "kpop_videos.app_kpop.id_artist",
                    "=",
                    "kpop_videos.app_kpop_group.id"
                )
                .whereNotIn("vlink", function () {
                    this.select("vlink").from("kmq.dead_links");
                })
                .where("vtype", "=", "main")
                .andWhere("tags", "NOT LIKE", "%c%");
        })
        .orderBy("views", "DESC");
}

async function getCurrentlyDownloadedFiles(): Promise<Set<string>> {
    return new Set(
        (await fs.promises.readdir(process.env.SONG_DOWNLOAD_DIR)).filter(
            (file) => file.endsWith(".ogg")
        )
    );
}

async function updateNotDownloaded(
    db: DatabaseContext,
    songs: Array<QueriedSong>
): Promise<void> {
    // update list of non-downloaded songs
    const currentlyDownloadedFiles = await getCurrentlyDownloadedFiles();

    const songIDsNotDownloaded = songs
        .filter((x) => !currentlyDownloadedFiles.has(`${x.youtubeLink}.ogg`))
        .map((x) => ({ vlink: x.youtubeLink }));

    await db.kmq.transaction(async (trx) => {
        await db.kmq("not_downloaded").del().transacting(trx);
        if (songIDsNotDownloaded.length > 0) {
            await db
                .kmq("not_downloaded")
                .insert(songIDsNotDownloaded)
                .transacting(trx);
        }
    });
}

const downloadNewSongs = async (
    db: DatabaseContext,
    limit?: number
): Promise<number> => {
    const allSongs: Array<QueriedSong> = await getSongsFromDb(db);
    let songsToDownload = limit ? allSongs.slice(0, limit) : allSongs.slice();
    let downloadCount = 0;
    let deadLinksSkipped = 0;
    const knownDeadIDs = new Set(
        (await db.kmq("dead_links").select("vlink")).map((x) => x.vlink)
    );

    const currentlyDownloadedFiles = await getCurrentlyDownloadedFiles();

    logger.info(`Total songs in database: ${allSongs.length}`);
    songsToDownload = songsToDownload.filter(
        (x) => !currentlyDownloadedFiles.has(`${x.youtubeLink}.ogg`)
    );

    songsToDownload = songsToDownload.filter(
        (x) => !knownDeadIDs.has(x.youtubeLink)
    );
    logger.info(`Total songs to be downloaded: ${songsToDownload.length}`);

    // update current list of non-downloaded songs
    await updateNotDownloaded(db, allSongs);

    for (const song of songsToDownload) {
        logger.info(
            `Downloading song: '${song.songName}' by ${song.artistName} | ${
                song.youtubeLink
            } (${downloadCount + 1}/${songsToDownload.length})`
        );
        try {
            // eslint-disable-next-line no-await-in-loop
            await retryJob(downloadSong, [db, song.youtubeLink], 1, true, 5000);
        } catch (err) {
            logger.error(
                `Error downloading song ${song.youtubeLink}, skipping... err = ${err}`
            );
            deadLinksSkipped++;
            try {
                // eslint-disable-next-line no-await-in-loop
                await fs.promises.unlink(
                    `${process.env.SONG_DOWNLOAD_DIR}/${song.youtubeLink}.mp3.part`
                );
            } catch (tempErr) {
                logger.error(
                    `Error deleting temp file ${song.youtubeLink}.mp3.part, err = ${tempErr}`
                );
            }

            continue;
        }

        logger.info(
            `Encoding song: '${song.songName}' by ${song.artistName} | ${song.youtubeLink}`
        );
        try {
            // eslint-disable-next-line no-await-in-loop
            await retryJob(ffmpegOpusJob, [song.youtubeLink], 1, true, 5000);
        } catch (err) {
            logger.error(
                `Error encoding song ${song.youtubeLink}, exiting... err = ${err}`
            );
            break;
        }

        downloadCount++;
    }

    // update final list of non-downloaded songs
    await updateNotDownloaded(db, allSongs);
    logger.info(
        `Total songs downloaded: ${downloadCount}, (${deadLinksSkipped} dead links skipped)`
    );
    return downloadCount;
};

/**
 * @param limit - The limit specified for downloading songs
 * @returns - the number of songs downloaded
 */
export default async function downloadAndConvertSongs(
    limit?: number
): Promise<number> {
    const db = getNewConnection();
    try {
        if (!(await pathExists(process.env.SONG_DOWNLOAD_DIR))) {
            logger.error("Song cache directory doesn't exist.");
            return 0;
        }

        await clearPartiallyCachedSongs();
        const songsDownloaded = await downloadNewSongs(db, limit);
        return songsDownloaded;
    } finally {
        await db.destroy();
    }
}
