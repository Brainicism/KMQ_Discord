/* eslint-disable no-await-in-loop */
import * as cp from "child_process";
import {
    DataFiles,
    YOUTUBE_SESSION_COOKIE_PATH,
    YT_DLP_LOCATION,
} from "../constants";
import { IPCLogger } from "../logger";
import {
    extractErrorString,
    parseJsonFile,
    pathExists,
    pathExistsSync,
    validateYouTubeID,
} from "./utils";
import { getAverageVolume } from "./discord_utils";
import { getNewConnection } from "../database_context";
import Axios from "axios";
import KmqConfiguration from "../kmq_configuration";
import YoutubeOnesieProvider from "../youtube_onesie_provider";
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

    private proxies: Array<string>;
    private onesieProvider: YoutubeOnesieProvider;
    private youtubeSessionTokens:
        | {
              po_token: string;
              visitor_data: string;
              generated_at: string;
          }
        | undefined;

    private hasYtDlpSessionCookies = false;

    constructor() {
        this.onesieProvider = new YoutubeOnesieProvider();
        if (!pathExistsSync(DataFiles.PROXY_FILE)) {
            logger.warn("Proxy file doesn't exist");
            this.proxies = [];
        } else {
            // eslint-disable-next-line node/no-sync
            this.proxies = fs
                .readFileSync(DataFiles.PROXY_FILE)
                .toString()
                .trim()
                .split("\n")
                .filter((x) => x);

            logger.info(
                `Found ${this.proxies.length} proxies. proxies = ${JSON.stringify(this.proxies)}`,
            );
        }
    }

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
     * @param skipDownload - Whether ot skip download
     * @returns - the number of songs downloaded
     */
    public async downloadNewSongs(
        limit?: number,
        songOverrides?: string[],
        checkSongDurations?: boolean,
        skipDownload = false,
    ): Promise<{ songsDownloaded: number; songsFailed: number }> {
        if (KmqConfiguration.Instance.downloadWithOnesieRequest()) {
            logger.info("Downloading via onesie URLs");
        } else {
            logger.info("Downloading via yt-dlp");
            await this.reloadYoutubeSessionTokens();
        }

        const db = getNewConnection();
        try {
            if (!(await pathExists(process.env.SONG_DOWNLOAD_DIR as string))) {
                logger.error("Song cache directory doesn't exist.");
                return { songsDownloaded: 0, songsFailed: 0 };
            }

            await this.clearPartiallyCachedSongs();
            await this.processUnprocessedM4aFiles(db);

            const allSongs = await this.getExpectedSongsToDownload(db);

            let songsToDownload = allSongs;

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

            if (limit) {
                logger.info(
                    `Limiting song downloads at: ${limit} out of ${songsToDownload.length}`,
                );
                songsToDownload = songsToDownload.slice(0, limit);
            }

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
            const proxySeed = Date.now();
            if (!skipDownload) {
                for (let i = 0; i < songsToDownload.length; i++) {
                    const song = songsToDownload[i]!;
                    let proxy: string | undefined;
                    if (KmqConfiguration.Instance.ytdlpDownloadWithProxy()) {
                        proxy =
                            this.proxies[(i + proxySeed) % this.proxies.length];

                        logger.info(
                            `Downloading song: '${song.songName}' by ${song.artistName} | ${
                                song.youtubeLink
                            } (${downloadCount + downloadsFailed + 1}/${songsToDownload.length})  (proxy = ${proxy})`,
                        );
                    } else {
                        logger.info(
                            `Downloading song: '${song.songName}' by ${song.artistName} | ${
                                song.youtubeLink
                            } (${downloadCount + downloadsFailed + 1}/${songsToDownload.length})`,
                        );
                    }

                    if (song.betterAudioLink) {
                        logger.info(
                            `Detected better audio link for ${song.youtubeLink}: ${song.betterAudioLink}`,
                        );
                    }

                    const cachedSongLocation = path.join(
                        process.env.SONG_DOWNLOAD_DIR as string,
                        `${song.youtubeLink}.m4a`,
                    );

                    try {
                        if (process.env.MOCK_AUDIO === "true") {
                            logger.info(
                                `Mocking downloading for ${song.youtubeLink}`,
                            );

                            await fs.promises.copyFile(
                                path.resolve(__dirname, "../test/silence.m4a"),
                                cachedSongLocation,
                            );
                        } else {
                            try {
                                await this.downloadYouTubeAudio(
                                    db,
                                    song.betterAudioLink || song.youtubeLink,
                                    cachedSongLocation,
                                    proxy,
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
            logger.warn("Youtube session token is 6 hours old, should refresh");
        }

        logger.info(
            `Youtube session tokens loaded (${this.youtubeSessionTokens.generated_at})`,
        );
    }

    private async encodeToOpus(
        fileLocation: string,
        db: DatabaseContext,
    ): Promise<void> {
        return new Promise(async (resolve, reject) => {
            const videoID = path.basename(fileLocation).replace(".m4a", "");
            const oggFileWithPath = fileLocation.replace(".m4a", ".ogg");
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
                .audioChannels(2) // discord only supports stereo
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

    private async downloadYoutubeViaOnesieRequest(
        db: DatabaseContext,
        id: string,
        outputFile: string,
    ): Promise<void> {
        try {
            const onesieUrl = await this.onesieProvider.getDownloadUrl(id);
            const downloadResponse = await Axios.get(onesieUrl, {
                responseType: "stream",
            });

            await fs.promises.writeFile(outputFile, downloadResponse.data, {
                encoding: null,
            });
        } catch (e) {
            await db.kmq
                .insertInto("dead_links")
                .values({
                    created_at: new Date(),
                    vlink: id,
                    reason: `Failed to download video: error = ${e}. `,
                })
                .ignore()
                .execute();

            throw new Error(e);
        }
    }

    private async downloadYoutubeViaYtDlp(
        db: DatabaseContext,
        id: string,
        outputFile: string,
        proxy: string | undefined,
    ): Promise<void> {
        if (!this.youtubeSessionTokens) {
            logger.warn("Youtube session token doesn't exist... aborting");
            throw new Error("Youtube session token doesn't exist");
        }

        try {
            const ytdlpArgs = [
                YT_DLP_LOCATION,
                "-f",
                "'bestaudio[ext=m4a]'",
                "-o",
                `'${outputFile}'`,
                "--abort-on-unavailable-fragments",
            ];

            if (KmqConfiguration.Instance.ytdlpDownloadWithProxy()) {
                if (proxy) {
                    ytdlpArgs.push("--proxy", proxy);
                } else {
                    logger.warn("Proxy unexpectedly empty");
                }
            }

            if (KmqConfiguration.Instance.ytdlpDownloadWithPoToken()) {
                ytdlpArgs.push(
                    "--extractor-args",
                    `"youtube:player-client=web_creator;po_token=web_creator+${this.youtubeSessionTokens.po_token}"`,
                );
                ytdlpArgs.push("--cookies", YOUTUBE_SESSION_COOKIE_PATH);
            }

            ytdlpArgs.push("--", `'${id}'`);
            const ytdlpCommand = ytdlpArgs.join(" ");
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

    private async downloadYouTubeAudio(
        db: DatabaseContext,
        id: string,
        outputFile: string,
        proxy: string | undefined,
    ): Promise<void> {
        if (!validateYouTubeID(id)) {
            throw new Error(`Invalid video ID. id = ${id}`);
        }

        if (KmqConfiguration.Instance.downloadWithOnesieRequest()) {
            await this.downloadYoutubeViaOnesieRequest(db, id, outputFile);
        } else {
            await this.downloadYoutubeViaYtDlp(db, id, outputFile, proxy);
        }
    }

    private async getExpectedSongsToDownload(db: DatabaseContext): Promise<
        {
            songName: string;
            views: number;
            artistName: string;
            youtubeLink: string;
            betterAudioLink: string | null;
        }[]
    > {
        const deadLinks = (
            await db.kmq.selectFrom("dead_links").select("vlink").execute()
        ).map((x) => x.vlink);

        return db.kmq
            .selectFrom("expected_available_songs")
            .select([
                "song_name_en as songName",
                "artist_name_en as artistName",
                "link as youtubeLink",
                "better_audio_link as betterAudioLink",
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

    // find half-finished song downloads, or externally downloaded m4a files
    private async processUnprocessedM4aFiles(
        db: DatabaseContext,
    ): Promise<void> {
        const m4aFiles = (
            await fs.promises.readdir(process.env.SONG_DOWNLOAD_DIR as string)
        )
            .filter((file) => file.endsWith(".m4a"))
            .map((x) => path.join(process.env.SONG_DOWNLOAD_DIR as string, x));

        if (m4aFiles.length === 0) return;

        logger.info(`Found ${m4aFiles.length} unprocessed m4a files`);
        for (const m4aFile of m4aFiles) {
            logger.info(`ffmpeg processing '${m4aFile}'`);
            await this.encodeToOpus(m4aFile, db);
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
