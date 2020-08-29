import * as cronParser from "cron-parser";
import * as Eris from "eris";
import * as fs from "fs";
import * as _config from "./config/app_config.json";
import { validateConfig } from "./config_validator";
import { db } from "./databases";
import * as path from "path";
import { EMBED_INFO_COLOR, getCommandFiles, sendEndGameMessage, sendMessage } from "./helpers/discord_utils";
import { cleanupInactiveGameSessions } from "./helpers/game_utils";
import _logger from "./logger";
import { State } from "./types";
import ready from "./events/client/ready";
import messageCreate from "./events/client/messageCreate";
import voiceChannelLeave from "./events/client/voiceChannelLeave";
import voiceChannelSwitch from "./events/client/voiceChannelSwitch";
import warn from "./events/client/warn";
import connect from "./events/client/connect";
import error from "./events/client/error";
import shardDisconnect from "./events/client/shardDisconnect";
import shardReady from "./events/client/shardReady";
import shardResume from "./events/client/shardResume";
import unhandledRejection from "./events/process/unhandledRejection";
import uncaughtException from "./events/process/uncaughtException";
import SIGINT from "./events/process/SIGINT";
const logger = _logger("kmq");


const config: any = _config;
const ERIS_INTENTS = Eris.Constants.Intents;
const client = new Eris.Client(config.botToken, {
    disableEvents: {
        GUILD_DELETE: true,
        GUILD_ROLE_CREATE: true,
        GUILD_ROLE_UPDATE: true,
        GUILD_ROLE_DELETE: true,
        CHANNEL_CREATE: true,
        CHANNEL_DELETE: true,
        CHANNEL_PINS_UPDATE: true,
        MESSAGE_UPDATE: true,
        MESSAGE_DELETE: true,
        MESSAGE_DELETE_BULK: true,
        MESSAGE_REACTION_REMOVE: true,
        MESSAGE_REACTION_REMOVE_ALL: true,
        MESSAGE_REACTION_REMOVE_EMOJI: true
    },
    intents: ERIS_INTENTS.guilds ^ ERIS_INTENTS.guildVoiceStates ^ ERIS_INTENTS.guildMessages ^ ERIS_INTENTS.guildMessageReactions
});

const RESTART_WARNING_INTERVALS = new Set([10, 5, 2, 1]);

export let state: State = {
    commands: {},
    gameSessions: {},
    botStatsPoster: null,
    client: client
}

client.on("ready", ready)
    .on("messageCreate", messageCreate)
    .on("voiceChannelLeave", voiceChannelLeave)
    .on("voiceChannelSwitch", voiceChannelSwitch)
    .on("connect", connect)
    .on("error", error)
    .on("warn", warn)
    .on("shardDisconnect", shardDisconnect)
    .on("shardReady", shardReady)
    .on("shardResume", shardResume)

process.on("unhandledRejection", unhandledRejection)
    .on("uncaughtException", uncaughtException)
    .on("SIGINT", SIGINT)


export function deleteGameSession(guildId: string) {
    if (!(guildId in state.gameSessions)) {
        logger.debug(`gid: ${guildId} | GameSession already ended`);
        return;
    }
    delete state.gameSessions[guildId];
}


const checkRestartNotification = async (restartNotification: Date): Promise<void> => {
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
                        name: client.user.username,
                        icon_url: client.user.avatarURL
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

(async () => {
    if (!validateConfig(config)) {
        logger.error("Invalid config, aborting.");
        process.exit(1);
    }

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
    //populate group list
    const result = await db.kpopVideos("kpop_videos.app_kpop_group")
        .select(["name", "members as gender"])
        .orderBy("name", "ASC")
    fs.writeFileSync(path.resolve(process.cwd(), "../data/group_list.txt"), result.map((x) => x["name"]).join("\n"));

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
    client.connect();
})();
