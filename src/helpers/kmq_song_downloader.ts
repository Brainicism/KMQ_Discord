/* eslint-disable no-await-in-loop */
import * as cp from "child_process";
import { IPCLogger } from "../logger";
import { YOUTUBE_SESSION_COOKIE_PATH, YT_DLP_LOCATION } from "../constants";
import {
    extractErrorString,
    parseJsonFile,
    pathExists,
    pathExistsSync,
    validateYouTubeID,
} from "./utils";
import { getAverageVolume } from "./discord_utils";
import { getNewConnection } from "../database_context";
import KmqConfiguration from "../kmq_configuration";
import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import path from "path";
import util from "util";
import type { DatabaseContext } from "../database_context";

const exec = util.promisify(cp.exec);

const logger = new IPCLogger("download-new-songs");

export default class KmqSongDownloader {
    TARGET_AVERAGE_VOLUME = -30;

    YOUTUBE_SESSION_TOKENS_PATH = path.join(
        __dirname,
        "../../data/yt_session.json",
    );

    private youtubeSessionTokens:
        | {
              po_token: string;
              visitor_data: string;
              generated_at: string;
          }
        | undefined;

    private hasYtDlpSessionCookies = false;

    /**
     * @param songPath - the file path of the song file
     * @returns the audio duration of the song
     */
    static async getAudioDurationInSeconds(songPath: string): Promise<number> {
        const res = await exec(
            `ffprobe -i "${songPath}" -show_entries format=duration -v quiet -of csv="p=0"`,
        );

        if (res.stderr) {
            logger.error(
                `Error getting audio duration: path = ${songPath}, err = ${res.stderr}`,
            );

            throw new Error(res.stderr);
        }

        return parseInt(res.stdout, 10);
    }

    /**
     * @param limit - The limit specified for downloading songs
     * @param songOverrides - Song overrides
     * @param checkSongDurations - Whether to check if song durations are cached
     * @returns - the number of songs downloaded
     */
    public async downloadNewSongs(
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

            await this.reloadYoutubeSessionTokens();
            await this.clearPartiallyCachedSongs();
            await this.processUnprocessedMp3Files(db);

            const allSongs: Array<{
                songName: string;
                views: number;
                artistName: string;
                youtubeLink: string;
            }> = await this.getExpectedSongsToDownload(db);

            let songsToDownload = limit
                ? allSongs.slice(0, limit)
                : allSongs.slice();

            if (songOverrides) {
                songsToDownload = songsToDownload.filter((x) =>
                    songOverrides.includes(x.youtubeLink),
                );
            }

            let downloadCount = 0;
            let downloadsFailed = 0;
            const knownDeadIDs = new Set(
                (
                    await db.kmq
                        .selectFrom("dead_links")
                        .select("vlink")
                        .execute()
                ).map((x) => x.vlink),
            );

            const currentlyDownloadedFiles =
                await this.getCurrentlyDownloadedSongs();

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

                        await this.cacheSongDuration(
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

            logger.info(
                `Total songs to be downloaded: ${songsToDownload.length}`,
            );

            try {
                await this.updateYtDlp();
            } catch (err) {
                logger.warn(`Failed to get latest yt-dlp binary. err = ${err}`);
            }

            // update current list of non-downloaded songs
            await this.updateNotDownloaded(db, allSongs);

            logger.info(
                `Beginning song download. cookie_mode = ${KmqConfiguration.Instance.ytdlpDownloadWithCookie()}`,
            );

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
                        logger.info(
                            `Mocking downloading for ${song.youtubeLink}`,
                        );

                        await fs.promises.copyFile(
                            path.resolve(__dirname, "../test/silence.mp3"),
                            cachedSongLocation,
                        );
                    } else {
                        try {
                            await this.downloadYouTubeAudio(
                                db,
                                song.youtubeLink,
                                cachedSongLocation,
                            );
                        } catch (e) {
                            throw new Error(
                                `Failed to download video for '${song.youtubeLink}'. error = ${e}`,
                            );
                        }
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
                    await this.encodeToOpus(cachedSongLocation, db);
                } catch (err) {
                    logger.error(
                        `Error encoding song ${song.youtubeLink}, exiting... err = ${err}`,
                    );
                    break;
                }

                downloadCount++;
            }

            // update final list of non-downloaded songs
            await this.updateNotDownloaded(db, allSongs);
            logger.info(
                `Total songs downloaded: ${downloadCount}, (${downloadsFailed} downloads failed)`,
            );
            return {
                songsDownloaded: downloadCount,
                songsFailed: downloadsFailed,
            };
        } finally {
            await db.destroy();
        }
    }

    private async clearPartiallyCachedSongs(): Promise<void> {
        logger.info("Clearing partially cached songs");
        if (
            !(await pathExists(
                process.env.SONG_DOWNLOAD_DIR as string as string,
            ))
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
        const partFiles = files.filter((file) =>
            file.match(endingWithPartRegex),
        );

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

    private async cacheSongDuration(
        songLocation: string,
        id: string,
        db: DatabaseContext,
    ): Promise<void> {
        const duration =
            await KmqSongDownloader.getAudioDurationInSeconds(songLocation);

        await db.kmq
            .insertInto("cached_song_duration")
            .values({ vlink: id, duration })
            .onDuplicateKeyUpdate({ vlink: id, duration })
            .execute();
    }

    private async reloadYoutubeSessionTokens(): Promise<void> {
        if (process.env.MOCK_AUDIO === "true") {
            logger.info("Skipping Youtube session reload due to mock audio");
            return;
        }

        logger.info("Reloading Youtube session tokens");

        try {
            this.youtubeSessionTokens = await parseJsonFile(
                this.YOUTUBE_SESSION_TOKENS_PATH,
            );
        } catch (e) {
            logger.error(
                `Error while trying to reload youtube session token. e = ${extractErrorString(e)}`,
            );
        }

        this.hasYtDlpSessionCookies = pathExistsSync(
            YOUTUBE_SESSION_COOKIE_PATH,
        );

        if (
            !this.youtubeSessionTokens ||
            !this.youtubeSessionTokens.po_token ||
            !this.youtubeSessionTokens.visitor_data
        ) {
            logger.error(
                `Youtube session tokens unexpectedly empty. ${JSON.stringify(this.youtubeSessionTokens)}`,
            );
            return;
        }

        if (
            new Date(this.youtubeSessionTokens.generated_at) <
            new Date(new Date().getTime() - 6 * 60 * 60 * 1000)
        ) {
            logger.error(
                "Youtube session token is 6 hours old, should refresh",
            );
        }

        logger.info(
            `Youtube session tokens reloaded (${this.youtubeSessionTokens.generated_at})`,
        );
    }

    private async encodeToOpus(
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

            const volumeDifferential =
                this.TARGET_AVERAGE_VOLUME - currentAverageVolume;

            ffmpeg(fileLocation)
                .renice(20)
                .format("opus")
                .audioCodec("libopus")
                .audioFilters(`volume=${volumeDifferential}dB`)
                .output(oggFfmpegOutputStream)
                .on("end", async () => {
                    try {
                        await fs.promises.rename(
                            oggPartWithPath,
                            oggFileWithPath,
                        );

                        await fs.promises.unlink(
                            path.join(
                                process.env.SONG_DOWNLOAD_DIR as string,
                                path.basename(fileLocation),
                            ),
                        );

                        try {
                            await this.cacheSongDuration(
                                oggFileWithPath,
                                videoID,
                                db,
                            );
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

    private async downloadYouTubeAudio(
        db: DatabaseContext,
        id: string,
        outputFile: string,
    ): Promise<void> {
        if (!validateYouTubeID(id)) {
            throw new Error(`Invalid video ID. id = ${id}`);
        }

        if (!this.youtubeSessionTokens) {
            logger.warn("Youtube session token doesn't exist... aborting");
            throw new Error("Youtube session token doesn't exist");
        }

        try {
            let ytdlpCommand = `${YT_DLP_LOCATION} -f bestaudio -o "${outputFile}" --abort-on-unavailable-fragments --extractor-arg "youtube:player_client=web;po_token=${this.youtubeSessionTokens.po_token};visitor_data=${this.youtubeSessionTokens.visitor_data};player_skip=webpage,configs" -- '${id}';`;

            if (KmqConfiguration.Instance.ytdlpDownloadWithCookie()) {
                if (this.hasYtDlpSessionCookies) {
                    ytdlpCommand = `${YT_DLP_LOCATION} -f bestaudio -o "${outputFile}" --abort-on-unavailable-fragments --extractor-args "youtube:player-client=web,default;po_token=${this.youtubeSessionTokens.po_token}" --cookies ${YOUTUBE_SESSION_COOKIE_PATH} -- '${id}';`;
                } else {
                    logger.warn(
                        "ytdlpDownloadWithCookie enabled but cookie file missing, falling back to non-cookie",
                    );
                }
            }

            await exec(ytdlpCommand);
        } catch (err) {
            let errorMessage =
                (err as Error).message
                    .split("\n")
                    .find((x) => x.startsWith("ERROR:")) ||
                (err as Error).message;

            const sessionGeneratedOn = new Date(
                this.youtubeSessionTokens.generated_at,
            );

            const cookieGeneratedOn = this.hasYtDlpSessionCookies
                ? (await fs.promises.stat(YOUTUBE_SESSION_COOKIE_PATH)).mtime
                : null;

            errorMessage += `.\nsessionGeneratedOn=${sessionGeneratedOn.toISOString()}. cookieGeneratedOn=${cookieGeneratedOn?.toISOString()}. curr_time=${new Date().toISOString()}`;

            await db.kmq
                .insertInto("dead_links")
                .values({
                    created_at: new Date(),
                    vlink: id,
                    reason: `Failed to download video: error = ${errorMessage}. `,
                })
                .ignore()
                .execute();

            throw new Error(err);
        }
    }

    private async getExpectedSongsToDownload(db: DatabaseContext): Promise<
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

    private async getCurrentlyDownloadedSongs(): Promise<Set<string>> {
        return new Set(
            (
                await fs.promises.readdir(
                    process.env.SONG_DOWNLOAD_DIR as string,
                )
            ).filter((file) => file.endsWith(".ogg")),
        );
    }

    // find half-finished song downloads, or mp3 files downloaded outside of ytdl-core
    private async processUnprocessedMp3Files(
        db: DatabaseContext,
    ): Promise<void> {
        const mp3Files = (
            await fs.promises.readdir(process.env.SONG_DOWNLOAD_DIR as string)
        )
            .filter((file) => file.endsWith(".mp3"))
            .map((x) => path.join(process.env.SONG_DOWNLOAD_DIR as string, x));

        if (mp3Files.length === 0) return;

        logger.info(`Found ${mp3Files.length} unprocessed mp3 files`);
        for (const mp3File of mp3Files) {
            logger.info(`ffmpeg processing '${mp3File}'`);
            await this.encodeToOpus(mp3File, db);
        }
    }

    private async updateNotDownloaded(
        db: DatabaseContext,
        songs: Array<{
            songName: string;
            views: number;
            artistName: string;
            youtubeLink: string;
        }>,
    ): Promise<void> {
        // update list of non-downloaded songs
        const currentlyDownloadedFiles =
            await this.getCurrentlyDownloadedSongs();

        const songIDsNotDownloaded = songs
            .filter(
                (x) => !currentlyDownloadedFiles.has(`${x.youtubeLink}.ogg`),
            )
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

    private async updateYtDlp(): Promise<void> {
        if (!KmqConfiguration.Instance.ytdlpUpdatesEnabled()) {
            return;
        }

        try {
            await exec(`${YT_DLP_LOCATION} -U`);
        } catch (err) {
            throw new Error(`Failed to update yt-dlp library. err = ${err}`);
        }
    }
}