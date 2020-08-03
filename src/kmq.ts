import * as Discord from "discord.js";
import * as Knex from "knex";
import * as cronParser from "cron-parser";
import * as _kmqKnexConfig from "../config/knexfile_kmq";
import * as _kpopVideosKnexConfig from "../config/knexfile_kpop_videos";
import { validateConfig } from "./config_validator";
import { guessSong, endGame, cleanupInactiveGameSessions, getGuildPreference } from "./helpers/game_utils";
import validate from "./helpers/validate";
import { getCommandFiles, EMBED_INFO_COLOR } from "./helpers/discord_utils";
import { ParsedMessage } from "types";
import * as _config from "../config/app_config.json";
import BaseCommand from "commands/base_command";
import GameSession from "models/game_session";
import BotStatsPoster from "./helpers/bot_stats_poster";
import _logger from "./logger";
import * as fs from "fs";
const logger = _logger("kmq");

const client = new Discord.Client();

const config: any = _config;
const RESTART_WARNING_INTERVALS = new Set([10, 5, 2, 1]);

let db: {
    kmq: Knex,
    kpopVideos: Knex
};
let commands: { [commandName: string]: BaseCommand } = {};
let gameSessions: { [guildID: string]: GameSession } = {};
let botStatsPoster: BotStatsPoster = null;

client.on("ready", () => {
    logger.info(`Logged in as ${client.user.tag}! in '${process.env.NODE_ENV}' mode`);
});

client.on("message", async (message: Discord.Message) => {
    if (message.author.equals(client.user) || message.author.bot) return;
    if (!message.guild) return;
    let guildPreference = await getGuildPreference(db, message.guild.id);
    let botPrefix = guildPreference.getBotPrefix();
    let parsedMessage = parseMessage(message.content, botPrefix) || null;

    if (message.isMemberMentioned(client.user) && message.content.split(" ").length == 1) {
        // Any message that mentions the bot sends the current options
        commands["options"].call({ message, db });
    }
    if (parsedMessage && commands[parsedMessage.action]) {
        let command = commands[parsedMessage.action];
        if (validate(message, parsedMessage, command.validations, botPrefix)) {
            command.call({
                client,
                gameSessions,
                message,
                db,
                parsedMessage,
                botPrefix
            });
        }
    }
    else {
        if (gameSessions[message.guild.id] && gameSessions[message.guild.id].gameInSession()) {
            guessSong({ client, message, gameSessions, db });
            gameSessions[message.guild.id].lastActiveNow(db);
        }
    }
});

client.on("voiceStateUpdate", async (oldState, newState) => {
    let oldUserChannel = oldState.voiceChannel;
    if (!oldUserChannel) {
        return;
    }
    let newUserChannel = newState.voiceChannel;
    if (!newUserChannel) {
        let guildID = oldUserChannel.guild.id;
        let gameSession = gameSessions[guildID];
        // User left voice channel, check if bot is only one left
        if (oldUserChannel.members.size === 1 && oldUserChannel.members.has(client.user.id)) {
            let voiceConnection = client.voiceConnections.get(guildID);
            if (voiceConnection) {
                voiceConnection.disconnect();
                if (gameSession) {
                    logger.info(`gid: ${oldUserChannel.guild.id} | Bot is only user left, leaving voice...`)
                    await endGame(gameSessions, newState.guild.id, db);
                }
                return;
            }
        }
        // Bot was disconnected voice channel (either via a kick by an admin or the situation handled above)
        if (oldState.user === client.user && !oldUserChannel.members.has(client.user.id)) {
            if (gameSession) {
                logger.info(`gid: ${oldUserChannel.guild.id} | Bot disconnected.`)
                await endGame(gameSessions, newState.guild.id, db);
            }
        }
    }
});




const parseMessage = (message: string, botPrefix: string): ParsedMessage => {
    if (message.charAt(0) !== botPrefix) return null;
    let components = message.split(" ");
    let action = components.shift().substring(1);
    let argument = components.join(" ");
    return {
        action,
        argument,
        message,
        components
    }
}

const checkRestartNotification = async (restartNotification: Date): Promise<void> => {
    let timeDiffMin = Math.floor((restartNotification.getTime() - (new Date()).getTime()) / (1000 * 60));
    let channelsWarned = 0;
    if (RESTART_WARNING_INTERVALS.has(timeDiffMin)) {
        for (let guildId in gameSessions) {
            let gameSession = gameSessions[guildId];
            if (gameSession.finished) continue;
            await gameSession.textChannel.send({
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
    let kmqKnexConfig: any = _kmqKnexConfig;
    let kpopVideosKnexConfig: any = _kpopVideosKnexConfig;
    db = {
        kmq: Knex(kmqKnexConfig),
        kpopVideos: Knex(kpopVideosKnexConfig)
    }
    if (!validateConfig(config)) {
        logger.error("Invalid config, aborting.");
        process.exit(1);
    }

    //load commands
    let commandFiles = await getCommandFiles();
    for (const [commandName, command] of Object.entries(commandFiles)) {
        if (commandName === "base_command") continue;
        commands[commandName] = command;
        if (command.aliases) {
            command.aliases.forEach((alias) => {
                commands[alias] = command;
            });
        }
    }
    //populate group list
    let result = await db.kpopVideos("kpop_videos.app_kpop_group")
        .select(["name", "members as gender"])
        .orderBy("name", "ASC")
    fs.writeFileSync(config.groupListFile, result.map((x) => x["name"]).join("\n"));

    //set up bot stats poster
    botStatsPoster = new BotStatsPoster(client);
    botStatsPoster.start();

    //set up cleanup for inactive game sessions
    setInterval(() => {
        cleanupInactiveGameSessions(gameSessions, db);
    }, 10 * 60 * 1000)

    //set up check for restart notifications
    setInterval(async () => {
        //unscheduled restarts
        let restartNotification = (await db.kmq("restart_notifications").where("id", 1))[0]["restart_time"];
        if (restartNotification) {
            let restartNotificationTime = new Date(restartNotification);
            if (restartNotificationTime.getTime() > Date.now()) {
                await checkRestartNotification(restartNotificationTime);
                return;
            }
        }

        //cron based restart
        if (config.restartCron) {
            let interval = cronParser.parseExpression(config.restartCron);
            let nextRestartTime = interval.next();
            await checkRestartNotification(nextRestartTime.toDate());
        }
    }, 60 * 1000);
    client.login(config.botToken);
})();

process.on("unhandledRejection", (reason: Error, p: Promise<any>) => {
    logger.error(`Unhandled Rejection at: Promise ${p}. Reason: ${reason}. Trace: ${reason.stack}`);
});


process.on("uncaughtException", (err: Error) => {
    logger.error(`Uncaught Exception. Reason: ${err}. Trace: ${err.stack}`);
});
