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
import ytdl from "@distube/ytdl-core";
import type { DatabaseContext } from "../database_context";
import type QueriedSong from "../interfaces/queried_song";

const logger = new IPCLogger("download-new-songs");
const TARGET_AVERAGE_VOLUME = -30;

async function clearPartiallyCachedSongs(): Promise<void> {
    logger.info("Clearing partially cached songs");
    if (
        !(await pathExists(process.env.SONG_DOWNLOAD_DIR as string as string))
    ) {
        logger.error("Song cache directory doesn't exist.");
        return;
    }

    let files: Array<string>;
    try {
        files = await fs.promises.readdir(
            process.env.SONG_DOWNLOAD_DIR as string as string,
        );
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
                    `${process.env.SONG_DOWNLOAD_DIR as string}/${partFile}`,
                );
            } catch (err) {
                logger.error(err);
            }
        }),
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
                        `Error getting average volume: path = ${mp3File}, err = ${stderr}`,
                    );
                    reject();
                    return;
                }

                resolve(parseFloat(stdout));
            },
        );
    });
}

async function ffmpegOpusJob(id: string): Promise<void> {
    const mp3File = path.join(
        process.env.SONG_DOWNLOAD_DIR as string,
        `${id}.mp3`,
    );

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
                            process.env.SONG_DOWNLOAD_DIR as string,
                            path.basename(mp3File),
                        ),
                    );
                    resolve();
                } catch (err) {
                    if (!(await pathExists(oggFileWithPath))) {
                        reject(
                            new Error(
                                `File ${oggFileWithPath} wasn't created. err = ${err}`,
                            ),
                        );
                    }

                    reject(
                        new Error(
                            `File ${oggFileWithPath} might have duplicate entries in db. err = ${err}`,
                        ),
                    );
                }
            })
            .on("error", (transcodingErr: Error) => {
                reject(transcodingErr);
            })
            .run();
    });
}

const downloadSong = (db: DatabaseContext, id: string): Promise<void> => {
    const cachedSongLocation = path.join(
        process.env.SONG_DOWNLOAD_DIR as string,
        `${id}.mp3`,
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
                `https://www.youtube.com/watch?v=${id}`,
            );

            const { playabilityStatus }: any = infoResponse.player_response;
            if (playabilityStatus.status !== "OK") {
                await db.kmq
                    .insertInto("dead_links")
                    .values({
                        vlink: id,
                        reason: `Failed to load video: error = ${playabilityStatus.reason}`,
                    })
                    .ignore()
                    .execute();

                reject(
                    new Error(
                        `Failed to load video: error = ${playabilityStatus.reason}`,
                    ),
                );
                return;
            }

            // download video
            ytdl(`https://www.youtube.com/watch?v=${id}`, ytdlOptions).pipe(
                cacheStream,
            );
        } catch (e) {
            const errorMessage = `Failed to retrieve video metadata for '${id}'. error = ${e}`;
            await db.kmq
                .insertInto("dead_links")
                .values({
                    vlink: id,
                    reason: errorMessage,
                })
                .ignore()
                .execute();

            reject(new Error(errorMessage));
            return;
        }

        cacheStream.once("finish", async () => {
            try {
                if ((await fs.promises.stat(tempLocation)).size === 0) {
                    reject(new Error(`Song file is empty. id = ${id}`));
                    return;
                }

                await fs.promises.rename(tempLocation, cachedSongLocation);
                const duration =
                    await getAudioDurationInSeconds(cachedSongLocation);

                await db.kmq
                    .insertInto("cached_song_duration")
                    .values({ vlink: id, duration })
                    .onDuplicateKeyUpdate({ vlink: id, duration })
                    .execute();

                resolve();
            } catch (err) {
                reject(
                    new Error(
                        `Error renaming temp song file from ${tempLocation} to ${cachedSongLocation}. err = ${err}`,
                    ),
                );
            }
        });
        cacheStream.once("error", (e) => reject(e));
    });
};

async function getSongsFromDb(databaseContext: DatabaseContext): Promise<any> {
    const deadLinks = (
        await databaseContext.kmq
            .selectFrom("dead_links")
            .select("vlink")
            .execute()
    ).map((x) => x.vlink);

    let builder = databaseContext.kpopVideos
        .selectFrom("app_kpop")
        .innerJoin("app_kpop_group", "app_kpop.id_artist", "app_kpop_group.id")
        .select([
            "app_kpop.name as songName",
            "app_kpop_group.name as artistName",
            "app_kpop.vlink as youtubeLink",
            "app_kpop.views as views",
        ])
        .where("vtype", "=", "main")
        .where("tags", "not like", "%c%");

    builder = builder.where("vlink", "not in", deadLinks);
    return builder.execute();
}

async function getCurrentlyDownloadedFiles(): Promise<Set<string>> {
    return new Set(
        (
            await fs.promises.readdir(process.env.SONG_DOWNLOAD_DIR as string)
        ).filter((file) => file.endsWith(".ogg")),
    );
}

async function updateNotDownloaded(
    db: DatabaseContext,
    songs: Array<QueriedSong>,
): Promise<void> {
    // update list of non-downloaded songs
    const currentlyDownloadedFiles = await getCurrentlyDownloadedFiles();

    const songIDsNotDownloaded = songs
        .filter((x) => !currentlyDownloadedFiles.has(`${x.youtubeLink}.ogg`))
        .map((x) => ({ vlink: x.youtubeLink }));

    await db.kmq.transaction().execute(async (trx) => {
        await trx.deleteFrom("not_downloaded").execute();
        if (songIDsNotDownloaded.length > 0) {
            await trx
                .insertInto("not_downloaded")
                .values(songIDsNotDownloaded)
                .execute();
        }
    });
}

const downloadNewSongs = async (
    db: DatabaseContext,
    limit?: number,
    songOverrides?: string[],
): Promise<number> => {
    const allSongs: Array<QueriedSong> = await getSongsFromDb(db);
    let songsToDownload = limit ? allSongs.slice(0, limit) : allSongs.slice();
    if (songOverrides) {
        songsToDownload = songsToDownload.filter((x) =>
            songOverrides.includes(x.youtubeLink),
        );
    }

    let downloadCount = 0;
    let deadLinksSkipped = 0;
    const knownDeadIDs = new Set(
        (await db.kmq.selectFrom("dead_links").select("vlink").execute()).map(
            (x) => x.vlink,
        ),
    );

    const currentlyDownloadedFiles = await getCurrentlyDownloadedFiles();

    logger.info(`Total songs in database: ${allSongs.length}`);
    songsToDownload = songsToDownload.filter(
        (x) => !currentlyDownloadedFiles.has(`${x.youtubeLink}.ogg`),
    );

    songsToDownload = songsToDownload.filter(
        (x) => !knownDeadIDs.has(x.youtubeLink),
    );
    logger.info(`Total songs to be downloaded: ${songsToDownload.length}`);

    // update current list of non-downloaded songs
    await updateNotDownloaded(db, allSongs);

    for (const song of songsToDownload) {
        logger.info(
            `Downloading song: '${song.songName}' by ${song.artistName} | ${
                song.youtubeLink
            } (${downloadCount + 1}/${songsToDownload.length})`,
        );
        try {
            // eslint-disable-next-line no-await-in-loop
            await retryJob(downloadSong, [db, song.youtubeLink], 1, true, 5000);
        } catch (err) {
            logger.error(
                `Error downloading song ${song.youtubeLink}, skipping... err = ${err}`,
            );
            deadLinksSkipped++;
            try {
                // eslint-disable-next-line no-await-in-loop
                await fs.promises.unlink(
                    `${process.env.SONG_DOWNLOAD_DIR as string}/${
                        song.youtubeLink
                    }.mp3.part`,
                );
            } catch (tempErr) {
                logger.error(
                    `Error deleting temp file ${song.youtubeLink}.mp3.part, err = ${tempErr}`,
                );
            }

            continue;
        }

        logger.info(
            `Encoding song: '${song.songName}' by ${song.artistName} | ${song.youtubeLink}`,
        );
        try {
            // eslint-disable-next-line no-await-in-loop
            await retryJob(ffmpegOpusJob, [song.youtubeLink], 1, true, 5000);
        } catch (err) {
            logger.error(
                `Error encoding song ${song.youtubeLink}, exiting... err = ${err}`,
            );
            break;
        }

        downloadCount++;
    }

    // update final list of non-downloaded songs
    await updateNotDownloaded(db, allSongs);
    logger.info(
        `Total songs downloaded: ${downloadCount}, (${deadLinksSkipped} dead links skipped)`,
    );
    return downloadCount;
};

/**
 * @param limit - The limit specified for downloading songs
 * @param songOverrides - Song overrides
 * @returns - the number of songs downloaded
 */
export default async function downloadAndConvertSongs(
    limit?: number,
    songOverrides?: string[],
): Promise<number> {
    const db = getNewConnection();
    try {
        if (!(await pathExists(process.env.SONG_DOWNLOAD_DIR as string))) {
            logger.error("Song cache directory doesn't exist.");
            return 0;
        }

        await clearPartiallyCachedSongs();
        const songsDownloaded = await downloadNewSongs(
            db,
            limit,
            songOverrides,
        );

        return songsDownloaded;
    } finally {
        await db.destroy();
    }
}
