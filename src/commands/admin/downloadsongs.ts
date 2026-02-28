import { IPCLogger } from "../../logger";
import { getNewConnection } from "../../database_context";
import { seedAndDownloadNewSongs } from "../../seed/seed_db";
import { sendErrorMessage, sendInfoMessage } from "../../helpers/discord_utils";
import CommandPrechecks from "../../command_prechecks";
import KmqSongDownloader from "../../helpers/kmq_song_downloader";
import MessageContext from "../../structures/message_context";
import type BaseCommand from "../interfaces/base_command";
import type CommandArgs from "../../interfaces/command_args";

const logger = new IPCLogger("download_songs");

enum DownloadMode {
    DOWNLOAD = "download",
    SEED = "seed",
}

// eslint-disable-next-line import/no-unused-modules
export default class DownloadSongsCommand implements BaseCommand {
    preRunChecks = [{ checkFn: CommandPrechecks.userAdminPrecheck }];

    // first argument may specify mode (download or seed), followed by optional count
    validations = {
        minArgCount: 0,
        maxArgCount: 2,
        arguments: [
            {
                name: "mode",
                type: "enum" as const,
                enums: Object.values(DownloadMode),
            },
            {
                name: "count",
                type: "int" as const,
                minValue: 1,
            },
        ],
    };

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
        const messageContext = MessageContext.fromMessage(message);

        // default operation is to download a limited number of songs
        // args: [mode] [count]
        const modeArg = parsedMessage.components[0] as DownloadMode;
        let downloadCount = 50;

        if (parsedMessage.components.length === 0) {
            await sendErrorMessage(messageContext, {
                title: "Download mode not specified",
                description:
                    "Mode required. Use `downloadsongs <mode> [count]` where mode is 'download' or 'seed'.",
            });
            return;
        }

        if (parsedMessage.components.length > 1) {
            const countArg = parsedMessage.components[1]!;
            const parsed = parseInt(countArg, 10);
            if (!Number.isNaN(parsed) && parsed > 0) {
                downloadCount = parsed;
            }
        }

        if (modeArg === DownloadMode.SEED) {
            await sendInfoMessage(messageContext, {
                title: "Seeding and downloading songs",
                description:
                    "Starting full seed followed by downloading any new songs. This may take several minutes...",
            });

            try {
                const db = getNewConnection();
                await seedAndDownloadNewSongs(db, downloadCount);
                await sendInfoMessage(messageContext, {
                    title: "Seed Complete",
                    description:
                        "Database seeding and song downloads finished.",
                });

                logger.info(`Manual seed requested by ${message.author.id}`);
            } catch (err) {
                logger.error(`Error while seeding/downloading songs: ${err}`);
                await sendErrorMessage(messageContext, {
                    title: "Seed Error",
                    description: `Failed to seed and download songs: ${err}`,
                });
            }

            return;
        }

        await sendInfoMessage(messageContext, {
            title: "Downloading songs",
            description: `Attempting to download ${downloadCount} song(s)...`,
        });

        try {
            const downloader = new KmqSongDownloader();
            const { songsDownloaded, songsFailed } =
                await downloader.downloadNewSongs(downloadCount);

            await sendInfoMessage(messageContext, {
                title: "Download Complete",
                description: `${songsDownloaded} song(s) downloaded, ${songsFailed} failed.`,
            });

            logger.info(
                `Manual song download requested by ${message.author.id}; downloaded=${songsDownloaded} failed=${songsFailed}`,
            );
        } catch (err) {
            logger.error(`Error while downloading songs: ${err}`);
            await sendErrorMessage(messageContext, {
                title: "Download Error",
                description: `Failed to download songs: ${err}`,
            });
        }
    };
}
