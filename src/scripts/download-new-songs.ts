/* eslint-disable no-await-in-loop */
import { IPCLogger } from "../logger";
import {
    extractErrorString,
    getAudioDurationInSeconds,
    pathExists,
    retryJob,
} from "../helpers/utils";
import { getAverageVolume } from "../helpers/discord_utils";
import { getNewConnection } from "../database_context";
import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import path from "path";
import ytdl from "@distube/ytdl-core";
import type { DatabaseContext } from "../database_context";

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

async function ffmpegOpusJob(fileLocation: string): Promise<void> {
    return new Promise(async (resolve, reject) => {
        const oggFileWithPath = fileLocation.replace(".mp3", ".ogg");
        if (await pathExists(oggFileWithPath)) {
            resolve();
        }

        const oggPartWithPath = `${oggFileWithPath}.part`;
        const oggFfmpegOutputStream = fs.createWriteStream(oggPartWithPath);

        const currentAverageVolume = await getAverageVolume(
            fileLocation,
            [],
            [],
        );

        const volumeDifferential = TARGET_AVERAGE_VOLUME - currentAverageVolume;
        ffmpeg(fileLocation)
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
                            path.basename(fileLocation),
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

async function cacheSongDuration(
    songLocation: string,
    id: string,
    db: DatabaseContext,
): Promise<void> {
    const duration = await getAudioDurationInSeconds(songLocation);

    await db.kmq
        .insertInto("cached_song_duration")
        .values({ vlink: id, duration })
        .onDuplicateKeyUpdate({ vlink: id, duration })
        .execute();
}

const downloadSong = (
    db: DatabaseContext,
    id: string,
    outputFile: string,
): Promise<void> => {
    const tempLocation = `${outputFile}.part`;
    const cacheStream = fs.createWriteStream(tempLocation);
    const ytdlOptions: ytdl.downloadOptions = {
        filter: "audioonly" as const,
        quality: "highest",
        agent: ytdl.createAgent(),
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
            const ytdlReadableStream = ytdl(
                `https://www.youtube.com/watch?v=${id}`,
                ytdlOptions,
            );

            ytdlReadableStream.on("error", (err: Error) => {
                const errorMessage = `Error in ytdl readable stream. err = ${extractErrorString(err)}`;
                logger.error(errorMessage);
                reject(new Error(errorMessage));
            });

            ytdlReadableStream.pipe(cacheStream);
        } catch (e) {
            const errorMessage = `Failed to retrieve video metadata for '${id}'. error = ${e}`;
            // 403s might be due to youtube bot detection, don't consider them dead
            if (!(e as Error).message.includes("Status code: 403")) {
                await db.kmq
                    .insertInto("dead_links")
                    .values({
                        vlink: id,
                        reason: errorMessage,
                    })
                    .ignore()
                    .execute();
            }

            reject(new Error(errorMessage));
            return;
        }

        cacheStream.once("finish", async () => {
            try {
                if ((await fs.promises.stat(tempLocation)).size === 0) {
                    reject(new Error(`Song file is empty. id = ${id}`));
                    return;
                }

                await fs.promises.rename(tempLocation, outputFile);
                resolve();
            } catch (err) {
                reject(
                    new Error(
                        `Error renaming temp song file from ${tempLocation} to ${outputFile}. err = ${err}`,
                    ),
                );
            }
        });
        cacheStream.once("error", (e) => reject(e));
    });
};

async function getSongsFromDb(db: DatabaseContext): Promise<
    {
        songName: string;
        views: number;
        artistName: string;
        youtubeLink: string;
    }[]
> {
    const deadLinks = (
        await db.kmq.selectFrom("dead_links").select("vlink").execute()
    ).map((x) => x.vlink);

    return db.kmq
        .selectFrom("expected_available_songs" as any)
        .select([
            "song_name_en as songName",
            "artist_name_en as artistName",
            "link as youtubeLink",
            "views",
        ])
        .where("link", "not in", deadLinks)
        .orderBy("views", "desc")
        .execute();
}

async function getCurrentlyDownloadedFiles(): Promise<Set<string>> {
    return new Set(
        (
            await fs.promises.readdir(process.env.SONG_DOWNLOAD_DIR as string)
        ).filter((file) => file.endsWith(".ogg")),
    );
}

// find half-finished song downloads, or mp3 files downloaded outside of ytdl-core
async function processUnprocessedMp3Files(): Promise<void> {
    const mp3Files = (
        await fs.promises.readdir(process.env.SONG_DOWNLOAD_DIR as string)
    )
        .filter((file) => file.endsWith(".mp3"))
        .map((x) => path.join(process.env.SONG_DOWNLOAD_DIR as string, x));

    if (mp3Files.length === 0) return;

    logger.info(`Found ${mp3Files.length} unprocessed mp3 files`);
    for (const mp3File of mp3Files) {
        logger.info(`ffmpeg processing '${mp3File}'`);
        await ffmpegOpusJob(mp3File);
    }
}

async function updateNotDownloaded(
    db: DatabaseContext,
    songs: Array<{
        songName: string;
        views: number;
        artistName: string;
        youtubeLink: string;
    }>,
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
    checkSongDurations = false,
): Promise<{ songsDownloaded: number; songsFailed: number }> => {
    await processUnprocessedMp3Files();

    const allSongs: Array<{
        songName: string;
        views: number;
        artistName: string;
        youtubeLink: string;
    }> = await getSongsFromDb(db);

    let songsToDownload = limit ? allSongs.slice(0, limit) : allSongs.slice();
    if (songOverrides) {
        songsToDownload = songsToDownload.filter((x) =>
            songOverrides.includes(x.youtubeLink),
        );
    }

    let downloadCount = 0;
    let downloadsFailed = 0;
    const knownDeadIDs = new Set(
        (await db.kmq.selectFrom("dead_links").select("vlink").execute()).map(
            (x) => x.vlink,
        ),
    );

    const currentlyDownloadedFiles = await getCurrentlyDownloadedFiles();

    if (checkSongDurations)
        // check for downloaded songs without cache duration
        for (const currentlyDownloadedFile of currentlyDownloadedFiles) {
            const result = !!(await db.kmq
                .selectFrom("cached_song_duration")
                .selectAll()
                .where(
                    "vlink",
                    "=",
                    currentlyDownloadedFile.replace(".ogg", ""),
                )
                .executeTakeFirst());

            if (!result) {
                logger.warn(
                    `${currentlyDownloadedFile} is downloaded, but missing cache duration`,
                );

                const songLocation = `${process.env.SONG_DOWNLOAD_DIR as string}/${currentlyDownloadedFile}`;

                await cacheSongDuration(
                    songLocation,
                    currentlyDownloadedFile.replace(".ogg", ""),
                    db,
                );
            }
        }

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

        const cachedSongLocation = path.join(
            process.env.SONG_DOWNLOAD_DIR as string,
            `${song.youtubeLink}.mp3`,
        );

        try {
            if (process.env.MOCK_AUDIO === "true") {
                logger.info(`Mocking downloading for ${song.youtubeLink}`);
                await fs.promises.copyFile(
                    path.resolve(__dirname, "../test/silence.mp3"),
                    cachedSongLocation,
                );
            } else {
                await retryJob(
                    downloadSong,
                    [db, song.youtubeLink, cachedSongLocation],
                    1,
                    true,
                    5000,
                    false,
                );
            }

            try {
                await cacheSongDuration(
                    cachedSongLocation,
                    song.youtubeLink,
                    db,
                );
            } catch (e) {
                await fs.promises.unlink(cachedSongLocation);
                throw new Error(
                    `Error calculating cached_song_duration. err = ${e}`,
                );
            }
        } catch (err) {
            logger.error(
                `Error downloading song ${song.youtubeLink}, skipping... err = ${err}`,
            );
            downloadsFailed++;
            try {
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
            await ffmpegOpusJob(cachedSongLocation);
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
        `Total songs downloaded: ${downloadCount}, (${downloadsFailed} downloads failed)`,
    );
    return {
        songsDownloaded: downloadCount,
        songsFailed: downloadsFailed,
    };
};

/**
 * @param limit - The limit specified for downloading songs
 * @param songOverrides - Song overrides
 * @param checkSongDurations - Whether to check if song durations are cached
 * @returns - the number of songs downloaded
 */
export default async function downloadAndConvertSongs(
    limit?: number,
    songOverrides?: string[],
    checkSongDurations?: boolean,
): Promise<{ songsDownloaded: number; songsFailed: number }> {
    const db = getNewConnection();
    try {
        if (!(await pathExists(process.env.SONG_DOWNLOAD_DIR as string))) {
            logger.error("Song cache directory doesn't exist.");
            return { songsDownloaded: 0, songsFailed: 0 };
        }

        await clearPartiallyCachedSongs();
        const songsDownloaded = await downloadNewSongs(
            db,
            limit,
            songOverrides,
            checkSongDurations,
        );

        return songsDownloaded;
    } finally {
        await db.destroy();
    }
}
