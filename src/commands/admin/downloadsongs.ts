import CommandPrechecks from "../../command_prechecks";
import { getNewConnection } from "../../database_context";
import { sendErrorMessage, sendInfoMessage } from "../../helpers/discord_utils";
import type CommandArgs from "../../interfaces/command_args";
import { IPCLogger } from "../../logger";
import { seedAndDownloadNewSongs } from "../../seed/seed_db";
import MessageContext from "../../structures/message_context";
import type BaseCommand from "../interfaces/base_command";

const logger = new IPCLogger("download_songs");

enum DownloadMode {
    DOWNLOAD = "download",
    SEED = "seed",
}

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

        const db = getNewConnection();
        const isSeedMode = modeArg === DownloadMode.SEED;
        await sendInfoMessage(messageContext, {
            title: isSeedMode
                ? "Seeding and downloading songs"
                : "Downloading songs",
            description: isSeedMode
                ? "Starting full seed followed by downloading any new songs. This may take several minutes..."
                : `Attempting to download ${downloadCount} song(s), this may take several minutes...`,
        });

        try {
            const { songsDownloaded, songsFailed } =
                await seedAndDownloadNewSongs(
                    db,
                    downloadCount,
                    undefined,
                    undefined,
                    false,
                    !isSeedMode,
                );

            await sendInfoMessage(messageContext, {
                title: "Download Complete",
                description: `${songsDownloaded} song(s) downloaded, ${songsFailed} failed.`,
            });

            if (isSeedMode) {
                logger.info(`Manual seed requested by ${message.author.id}`);
            } else {
                logger.info(
                    `Manual song download requested by ${message.author.id}; downloaded=${songsDownloaded} failed=${songsFailed}`,
                );
            }
        } catch (err) {
            logger.error(`Error while downloading songs: ${err}`);
            await sendErrorMessage(messageContext, {
                title: "Download Error",
                description: `Failed to download songs: ${err}`,
            });
        }
    };
}
