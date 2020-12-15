import cronParser from "cron-parser";
import path from "path";
import fs from "fs";
import _glob from "glob";
import { promisify } from "util";
import schedule from "node-schedule";
import _logger from "../logger";
import state from "../kmq";
import { sendMessage, EMBED_INFO_COLOR } from "./discord_utils";
import readyHandler from "../events/client/ready";
import messageCreateHandler from "../events/client/messageCreate";
import voiceChannelLeaveHandler from "../events/client/voiceChannelLeave";
import voiceChannelSwitchHandler from "../events/client/voiceChannelSwitch";
import connectHandler from "../events/client/connect";
import errorHandler from "../events/client/error";
import warnHandler from "../events/client/warn";
import shardDisconnectHandler from "../events/client/shardDisconnect";
import shardReadyHandler from "../events/client/shardReady";
import shardResumeHandler from "../events/client/shardResume";
import disconnectHandler from "../events/client/disconnect";
import unhandledRejectionHandler from "../events/process/unhandledRejection";
import uncaughtExceptionHandler from "../events/process/uncaughtException";
import SIGINTHandler from "../events/process/SIGINT";
import { cleanupInactiveGameSessions } from "./game_utils";
import dbContext from "../database_context";
import BaseCommand from "../commands/base_command";
import debugHandler from "../events/client/debug";
import guildCreateHandler from "../events/client/guildCreate";
import BotStatsPoster from "./bot_stats_poster";
import { EnvType } from "../types";
import storeDailyStats from "../scripts/store-daily-stats";
import { seedAndDownloadNewSongs } from "../seed/seed_db";
import { parseJsonFile } from "./utils";

const glob = promisify(_glob);

const logger = _logger("management_utils");

const RESTART_WARNING_INTERVALS = new Set([10, 5, 2, 1]);

export function registerClientEvents() {
    const { client } = state;
    client.on("ready", readyHandler)
        .on("messageCreate", messageCreateHandler)
        .on("voiceChannelLeave", voiceChannelLeaveHandler)
        .on("voiceChannelSwitch", voiceChannelSwitchHandler)
        .on("connect", connectHandler)
        .on("error", errorHandler)
        .on("warn", warnHandler)
        .on("shardDisconnect", shardDisconnectHandler)
        .on("shardReady", shardReadyHandler)
        .on("shardResume", shardResumeHandler)
        .on("disconnect", disconnectHandler)
        .on("debug", debugHandler)
        .on("guildCreate", guildCreateHandler);
}

export function registerProcessEvents() {
    process.on("unhandledRejection", unhandledRejectionHandler)
        .on("uncaughtException", uncaughtExceptionHandler)
        .on("SIGINT", SIGINTHandler);
}

export const checkRestartNotification = async (restartNotification: Date): Promise<void> => {
    const timeDiffMin = Math.floor((restartNotification.getTime() - (new Date()).getTime()) / (1000 * 60));
    let channelsWarned = 0;
    if (RESTART_WARNING_INTERVALS.has(timeDiffMin)) {
        for (const gameSession of Object.values(state.gameSessions)) {
            if (gameSession.finished) continue;
            await sendMessage({ channel: gameSession.textChannel }, {
                embed: {
                    color: EMBED_INFO_COLOR,
                    author: {
                        name: state.client.user.username,
                        icon_url: state.client.user.avatarURL,
                    },
                    title: `Upcoming bot restart in ${timeDiffMin} minutes.`,
                    description: "Downtime will be approximately 2 minutes.",
                },
            });
            channelsWarned++;
        }
        logger.info(`Impending bot restart in ${timeDiffMin} minutes. ${channelsWarned} servers warned.`);
    }
};

export function updateBotStatus() {
    const { client } = state;
    client.editStatus("online", {
        name: `over ${Math.floor(client.guilds.size / 100) * 100} servers`,
        type: 3,
    });
}

function sweepCaches() {
    logger.info("Sweeping cache..");
    const sweepResults = state.client.sweepCaches(15);
    if (sweepResults.users || sweepResults.members) {
        logger.info(`Swept ${sweepResults.users} users and ${sweepResults.members} members from cache`);
    }
}

export function reloadAliases() {
    const songAliasesFilePath = path.resolve(__dirname, "../../data/song_aliases.json");
    const artistAliasesFilePath = path.resolve(__dirname, "../../data/artist_aliases.json");
    try {
        state.aliases.song = parseJsonFile(songAliasesFilePath);
        state.aliases.artist = parseJsonFile(artistAliasesFilePath);
    } catch (err) {
        logger.error("Error parsing alias files");
        state.aliases.song = {};
        state.aliases.artist = {};
    }
}

export async function updateGroupList() {
    // populate group list
    const result = await dbContext.kpopVideos("kpop_videos.app_kpop_group")
        .select(["name", "members as gender"])
        .orderBy("name", "ASC");
    fs.writeFileSync(path.resolve(__dirname, "../../data/group_list.txt"), result.map((x) => x.name).join("\n"));
}

export function registerIntervals() {
    // set up cleanup for inactive game sessions
    schedule.scheduleJob("*/10 * * * *", () => {
        cleanupInactiveGameSessions(state.gameSessions);
        updateBotStatus();
        sweepCaches();
    });

    // set up check for restart notifications
    schedule.scheduleJob("* * * * *", async () => {
        // unscheduled restarts
        const restartNotification = (await dbContext.kmq("restart_notifications").where("id", 1))[0].restart_time;
        if (restartNotification) {
            const restartNotificationTime = new Date(restartNotification);
            if (restartNotificationTime.getTime() > Date.now()) {
                await checkRestartNotification(restartNotificationTime);
                return;
            }
        }

        // cron based restart
        if (process.env.RESTART_CRON) {
            const interval = cronParser.parseExpression(process.env.RESTART_CRON);
            const nextRestartTime = interval.next();
            await checkRestartNotification(nextRestartTime.toDate());
        }
    });

    schedule.scheduleJob("0 0 * * *", async () => {
        const serverCount = state.client.guilds.size;
        storeDailyStats(serverCount);
    });

    // every monday at 7am UTC => 2am EST
    schedule.scheduleJob("0 7 * * 1", async () => {
        logger.info("Performing regularly scheduled AoiMirai database seed");
        await seedAndDownloadNewSongs();
        logger.info("Updating group lists");
        await updateGroupList();
    });

    schedule.scheduleJob("*/5 * * * *", async () => {
        reloadAliases();
    });
}

export function getCommandFiles(): Promise<{ [commandName: string]: BaseCommand }> {
    return new Promise(async (resolve, reject) => {
        const commandMap = {};
        let files: Array<string>;
        try {
            files = await glob(process.env.NODE_ENV === EnvType.DEV ? "commands/**/*.ts" : "commands/**/*.js");
            for (const file of files) {
                const command = await import(path.join("../", file));
                const commandName = path.parse(file).name;
                logger.info(`Registering command: ${commandName}`);
                // eslint-disable-next-line new-cap
                commandMap[commandName] = new command.default();
            }
            resolve(commandMap);
        } catch (err) {
            reject();
            logger.error(`Unable to read commands error = ${err}`);
        }
    });
}

export async function registerCommands() {
    // load commands
    const commandFiles = await getCommandFiles();
    for (const [commandName, command] of Object.entries(commandFiles)) {
        if (commandName === "base_command") continue;
        state.commands[commandName] = command;
        if (command.aliases) {
            command.aliases.forEach((alias) => {
                state.commands[alias] = command;
            });
        }
    }
}

export function initializeBotStatsPoster() {
    state.botStatsPoster = new BotStatsPoster();
    state.botStatsPoster.start();
}

export function deleteGameSession(guildId: string) {
    if (!(guildId in state.gameSessions)) {
        logger.debug(`gid: ${guildId} | GameSession already ended`);
        return;
    }
    delete state.gameSessions[guildId];
}
