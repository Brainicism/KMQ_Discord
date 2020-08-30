import _logger from "../logger";
import { state } from "../kmq";
import { sendMessage, EMBED_INFO_COLOR } from "./discord_utils";
import Eris from "eris";
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
import config from "../config/app_config.json";
import cronParser from "cron-parser";
import path from "path";
import fs from "fs";
import { db } from "../databases";
import BaseCommand from "../commands/base_command";
const logger = _logger("management_utils");

const RESTART_WARNING_INTERVALS = new Set([10, 5, 2, 1]);

export function registerClientEvents(client: Eris.Client) {
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
        .on("disconnect", disconnectHandler);
}

export function registerProcessEvents(process: NodeJS.Process) {
    process.on("unhandledRejection", unhandledRejectionHandler)
        .on("uncaughtException", uncaughtExceptionHandler)
        .on("SIGINT", SIGINTHandler);
}

export function registerIntervals() {
    //set up cleanup for inactive game sessions
    setInterval(() => {
        cleanupInactiveGameSessions(state.gameSessions);
    }, 10 * 60 * 1000)

    //set up check for restart notifications
    setInterval(async () => {
        //unscheduled restarts
        const restartNotification = (await db.kmq("restart_notifications").where("id", 1))[0]["restart_time"];
        if (restartNotification) {
            const restartNotificationTime = new Date(restartNotification);
            if (restartNotificationTime.getTime() > Date.now()) {
                await checkRestartNotification(restartNotificationTime);
                return;
            }
        }

        //cron based restart
        if (config.restartCron) {
            const interval = cronParser.parseExpression(config.restartCron);
            const nextRestartTime = interval.next();
            await checkRestartNotification(nextRestartTime.toDate());
        }
    }, 60 * 1000);
}

export async function registerCommands() {
    //load commands
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

export async function updateGroupList() {
    //populate group list
    const result = await db.kpopVideos("kpop_videos.app_kpop_group")
        .select(["name", "members as gender"])
        .orderBy("name", "ASC")
    fs.writeFileSync(path.resolve(process.cwd(), "../data/group_list.txt"), result.map((x) => x["name"]).join("\n"));
}

export function deleteGameSession(guildId: string) {
    if (!(guildId in state.gameSessions)) {
        logger.debug(`gid: ${guildId} | GameSession already ended`);
        return;
    }
    delete state.gameSessions[guildId];
}


export const checkRestartNotification = async (restartNotification: Date): Promise<void> => {
    const timeDiffMin = Math.floor((restartNotification.getTime() - (new Date()).getTime()) / (1000 * 60));
    let channelsWarned = 0;
    if (RESTART_WARNING_INTERVALS.has(timeDiffMin)) {
        for (let guildId in state.gameSessions) {
            const gameSession = state.gameSessions[guildId];
            if (gameSession.finished) continue;
            await sendMessage({ channel: gameSession.textChannel }, {
                embed: {
                    color: EMBED_INFO_COLOR,
                    author: {
                        name: state.client.user.username,
                        icon_url: state.client.user.avatarURL
                    },
                    title: `Upcoming bot restart in ${timeDiffMin} minutes.`,
                    description: `Downtime will be approximately 2 minutes.`
                }
            })
            channelsWarned++;
        }
        logger.info(`Impending bot restart in ${timeDiffMin} minutes. ${channelsWarned} servers warned.`);
    }
}

export function getCommandFiles(): Promise<{ [commandName: string]: BaseCommand }> {
    return new Promise(async (resolve, reject) => {
        let commandMap = {};
        let files: Array<string>;
        try {
            files = await fs.promises.readdir("./commands");
        }
        catch (err) {
            reject();
            return logger.error(`Unable to read commands error = ${err}`);
        }

        for (const file of files) {
            const command = await import(`../commands/${file}`);
            const commandName = file.split(".")[0];
            commandMap[commandName] = new command.default()
        }
        resolve(commandMap);

    })
}
