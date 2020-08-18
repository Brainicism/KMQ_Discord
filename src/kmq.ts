import * as cronParser from "cron-parser";
import * as _kmqKnexConfig from "./config/knexfile_kmq";
import * as _kpopVideosKnexConfig from "./config/knexfile_kpop_videos";
import * as Eris from "eris";
import { validateConfig } from "./config_validator";
import { guessSong, cleanupInactiveGameSessions, getGuildPreference } from "./helpers/game_utils";
import validate from "./helpers/validate";
import { getCommandFiles, EMBED_INFO_COLOR, sendMessage, sendEndGameMessage, permissionsCheck } from "./helpers/discord_utils";
import { ParsedMessage } from "./types";
import * as _config from "./config/app_config.json";
import BaseCommand from "./commands/base_command";
import GameSession from "./models/game_session";
import BotStatsPoster from "./helpers/bot_stats_poster";
import _logger from "./logger";
import * as fs from "fs";
import { db } from "./databases";
const logger = _logger("kmq");


const config: any = _config;
const ERIS_INTENTS = Eris.Constants.Intents;
export const client = new Eris.Client(config.botToken, {
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

let commands: { [commandName: string]: BaseCommand } = {};
let gameSessions: { [guildID: string]: GameSession } = {};
let botStatsPoster: BotStatsPoster = null;

client.on("ready", () => {
    logger.info(`Logged in as ${client.user.username}#${client.user.discriminator}! in '${process.env.NODE_ENV}' mode`);
});


client.on("messageCreate", async (message: Eris.Message) => {
    if (message.author.id === client.user.id || message.author.bot) return;
    if (!message.guildID) {
        logger.info(`Received message in DMs: message = ${message.content}`);
        return;
    }
    if (!isGuildMessage(message)) return;

    const guildPreference = await getGuildPreference(message.guildID);
    const botPrefix = guildPreference.getBotPrefix();
    const parsedMessage = parseMessage(message.content, botPrefix) || null;

    if (message.mentions.includes(client.user) && message.content.split(" ").length == 1) {
        // Any message that mentions the bot sends the current options
        if (!(await permissionsCheck(message))) {
            return;
        }
        commands["options"].call({ message });
    }
    if (parsedMessage && commands[parsedMessage.action]) {
        const command = commands[parsedMessage.action];
        if (validate(message, parsedMessage, command.validations, botPrefix)) {
            if (!(await permissionsCheck(message))) {
                return;
            }
            command.call({
                gameSessions,
                message,
                parsedMessage,
                botPrefix
            });
        }
    }
    else {
        if (gameSessions[message.guildID] && gameSessions[message.guildID].gameRound) {
            guessSong({ message, gameSessions });
            gameSessions[message.guildID].lastActiveNow();
        }
    }
});

function isGuildMessage(message: Eris.Message): message is Eris.Message<Eris.GuildTextableChannel> {
    return (message.channel instanceof Eris.TextChannel)
}

client.on("voiceChannelLeave", async (member, oldChannel) => {
    const guildID = oldChannel.guild.id;
    const gameSession = gameSessions[guildID];
    await checkBotIsAlone(gameSession, oldChannel);
});

client.on("voiceChannelSwitch", async (member, newChannel, oldChannel) => {
    const guildID = oldChannel.guild.id;
    const gameSession = gameSessions[guildID];
    await checkBotIsAlone(gameSession, oldChannel);
})


async function checkBotIsAlone(gameSession: GameSession, channel: Eris.VoiceChannel) {
    if (channel.voiceMembers.size === 1 && channel.voiceMembers.has(client.user.id)) {
        if (gameSession) {
            logger.info(`gid: ${channel.guild.id} | Bot is only user left, leaving voice...`)
            sendEndGameMessage({ channel: gameSession.textChannel }, gameSession);
            await gameSessions[channel.guild.id].endSession(gameSessions);
        }
        return;
    }
}
client.on("error", (err, shardId) => {
    logger.error(`Client encountered error: ${err}`)
})

client.on("warn", (message, shardId) => {
    logger.warn(`Client encountered warning: ${message}`);
})


const parseMessage = (message: string, botPrefix: string): ParsedMessage => {
    if (message.charAt(0) !== botPrefix) return null;
    const components = message.split(" ");
    const action = components.shift().substring(1);
    const argument = components.join(" ");
    return {
        action,
        argument,
        message,
        components
    }
}

const checkRestartNotification = async (restartNotification: Date): Promise<void> => {
    const timeDiffMin = Math.floor((restartNotification.getTime() - (new Date()).getTime()) / (1000 * 60));
    let channelsWarned = 0;
    if (RESTART_WARNING_INTERVALS.has(timeDiffMin)) {
        for (let guildId in gameSessions) {
            const gameSession = gameSessions[guildId];
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
        commands[commandName] = command;
        if (command.aliases) {
            command.aliases.forEach((alias) => {
                commands[alias] = command;
            });
        }
    }
    //populate group list
    const result = await db.kpopVideos("kpop_videos.app_kpop_group")
        .select(["name", "members as gender"])
        .orderBy("name", "ASC")
    fs.writeFileSync(config.groupListFile, result.map((x) => x["name"]).join("\n"));

    //set up bot stats poster
    botStatsPoster = new BotStatsPoster(client);
    botStatsPoster.start();

    //set up cleanup for inactive game sessions
    setInterval(() => {
        cleanupInactiveGameSessions(gameSessions);
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

process.on("unhandledRejection", (reason: Error, p: Promise<any>) => {
    logger.error(`Unhandled Rejection at: Promise ${p}. Reason: ${reason}. Trace: ${reason.stack}`);
});


process.on("uncaughtException", (err: Error) => {
    logger.error(`Uncaught Exception. Reason: ${err}. Trace: ${err.stack}`);
});

process.on("SIGINT", async () => {
    logger.debug("SIGINT received, cleaning up...");
    for (let guildId in gameSessions) {
        const gameSession = gameSessions[guildId];
        await sendEndGameMessage({ channel: gameSession.textChannel }, gameSession);
        logger.debug(`gid: ${guildId} | Forcing game session end`);
        await gameSession.endSession(gameSessions);
    }
    await db.kmq.destroy();
    await db.kpopVideos.destroy();
    process.exit(0);
});
