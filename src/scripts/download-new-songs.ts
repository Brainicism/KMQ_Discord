/* eslint-disable no-await-in-loop */
import * as cp from "child_process";
import { IPCLogger } from "../logger";
import {
    getAudioDurationInSeconds,
    parseJsonFile,
    pathExists,
    validateYouTubeID,
} from "../helpers/utils";
import { getAverageVolume } from "../helpers/discord_utils";
import { getNewConnection } from "../database_context";
import KmqConfiguration from "../kmq_configuration";
import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import path from "path";
import util from "util";
import type { DatabaseContext } from "../database_context";

const exec = util.promisify(cp.exec);

const logger = new IPCLogger("download-new-songs");
const TARGET_AVERAGE_VOLUME = -30;
const ytDlpLocation = path.resolve(__dirname, "../../bin", "yt-dlp");

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

async function ffmpegOpusJob(
    fileLocation: string,
    db: DatabaseContext,
): Promise<void> {
    return new Promise(async (resolve, reject) => {
        const videoID = path.basename(fileLocation).replace(".mp3", "");
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

                    try {
                        await cacheSongDuration(oggFileWithPath, videoID, db);
                    } catch (e) {
                        await fs.promises.unlink(oggFileWithPath);
                        throw new Error(
                            `Error calculating cached_song_duration. err = ${e}`,
                        );
                    }

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

async function downloadYouTubeAudio(
    db: DatabaseContext,
    id: string,
    outputFile: string,
): Promise<void> {
    if (!validateYouTubeID(id)) {
        throw new Error(`Invalid video ID. id = ${id}`);
    }

    const sessionTokensPath = path.join(
        __dirname,
        "../../data/yt_session.json",
    );

    if (!(await pathExists(sessionTokensPath))) {
        logger.warn("Youtube session token doesn't exist... aborting");
        throw new Error("Youtube session token doesn't exist");
    }

    const ytSessionTokens: {
        po_token: string;
        visitor_data: string;
        generated_at: Date;
    } = await parseJsonFile(sessionTokensPath);

    if (
        ytSessionTokens.generated_at >
        new Date(new Date().getTime() - 6 * 60 * 60 * 1000)
    ) {
        logger.error("Youtube session token is 6 hours old, should refresh");
    }

    try {
        await exec(
            `${ytDlpLocation} -f bestaudio -o "${outputFile}" --extractor-arg "youtube:player_client=web;po_token=${ytSessionTokens.po_token};visitor_data=${ytSessionTokens.visitor_data};player_skip=webpage,configs" '${id}';`,
        );
    } catch (err) {
        const errorMessage =
            (err as Error).message
                .split("\n")
                .find((x) => x.startsWith("ERROR:")) || (err as Error).message;

        await db.kmq
            .insertInto("dead_links")
            .values({
                vlink: id,
                reason: `Failed to download video: error = ${errorMessage}`,
            })
            .ignore()
            .execute();

        throw new Error(err);
    }
}

const downloadSong = (
    db: DatabaseContext,
    id: string,
    outputFile: string,
): Promise<void> =>
    new Promise(async (resolve, reject) => {
        try {
            // download video
            await downloadYouTubeAudio(db, id, outputFile);
        } catch (e) {
            const errorMessage = `Failed to download video for '${id}'. error = ${e}`;
            reject(new Error(errorMessage));
            return;
        }

        resolve();
    });

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
async function processUnprocessedMp3Files(db: DatabaseContext): Promise<void> {
    const mp3Files = (
        await fs.promises.readdir(process.env.SONG_DOWNLOAD_DIR as string)
    )
        .filter((file) => file.endsWith(".mp3"))
        .map((x) => path.join(process.env.SONG_DOWNLOAD_DIR as string, x));

    if (mp3Files.length === 0) return;

    logger.info(`Found ${mp3Files.length} unprocessed mp3 files`);
    for (const mp3File of mp3Files) {
        logger.info(`ffmpeg processing '${mp3File}'`);
        await ffmpegOpusJob(mp3File, db);
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

async function getLatestYtDlpBinary(): Promise<void> {
    if (!KmqConfiguration.Instance.ytdlpUpdatesEnabled()) {
        return;
    }

    try {
        await fs.promises.access(ytDlpLocation, fs.constants.F_OK);
    } catch (_err) {
        logger.warn("yt-dlp binary doesn't exist, downloading...");
        try {
            await exec(
                `curl -L https://github.com/yt-dlp/yt-dlp-nightly-builds/releases/latest/download/yt-dlp -o ${ytDlpLocation}`,
            );
            await exec(`chmod u+x ${ytDlpLocation}`);
        } catch (err) {
            throw new Error(
                `Failed to fetch latest yt-dlp library. err = ${err}`,
            );
        }
    }

    try {
        await exec(`${ytDlpLocation} -U`);
    } catch (err) {
        throw new Error(`Failed to update yt-dlp library. err = ${err}`);
    }
}

const downloadNewSongs = async (
    db: DatabaseContext,
    limit?: number,
    songOverrides?: string[],
    checkSongDurations = false,
): Promise<{ songsDownloaded: number; songsFailed: number }> => {
    await processUnprocessedMp3Files(db);

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

    try {
        await getLatestYtDlpBinary();
    } catch (err) {
        logger.warn(`Failed to get latest yt-dlp binary. err = ${err}`);
    }

    // update current list of non-downloaded songs
    await updateNotDownloaded(db, allSongs);

    for (const song of songsToDownload) {
        logger.info(
            `Downloading song: '${song.songName}' by ${song.artistName} | ${
                song.youtubeLink
            } (${downloadCount + downloadsFailed + 1}/${songsToDownload.length})`,
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
                await downloadSong(db, song.youtubeLink, cachedSongLocation);
            }
        } catch (err) {
            logger.error(
                `Error downloading song ${song.youtubeLink}, skipping... err = ${err}`,
            );
            downloadsFailed++;
            continue;
        }

        logger.info(
            `Encoding song: '${song.songName}' by ${song.artistName} | ${song.youtubeLink}`,
        );
        try {
            await ffmpegOpusJob(cachedSongLocation, db);
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
