import * as Discord from "discord.js";
import * as Knex from "knex";
import * as _kmqKnexConfig from "../config/knexfile_kmq";
import * as _kpopVideosKnexConfig from "../config/knexfile_kpop_videos";
import * as DBL from "dblapi.js";
import { validateConfig } from "./config_validator";
import GuildPreference from "./models/guild_preference";
import { guessSong } from "./helpers/game_utils";
import validate from "./helpers/validate";
import { getCommandFiles } from "./helpers/discord_utils";
import { ParsedMessage } from "types";
import * as _config from "../config/app_config.json";
import BaseCommand from "commands/base_command";
import GameSession from "models/game_session";
import _logger from "./logger";
import * as fs from "fs";
const logger = _logger("kmq");

const client = new Discord.Client();

const config: any = _config;
let db: {
    kmq: Knex,
    kpopVideos: Knex
};
let commands: { [commandName: string]: BaseCommand } = {};
let gameSessions: { [guildID: string]: GameSession } = {};
let guildPreferences: { [guildID: string]: GuildPreference } = {};

const dbl = config.topGGToken ? new DBL(config.topGGToken, client) : null;

if (dbl) {
    dbl.on("posted", () => {
        logger.info("Server count posted!");
    });
    dbl.on("error", (e) => {
        logger.error(`Server count post failed! ${e}`);
    });
}
else {
    logger.info("No top.gg token passed (check your config.json)! Ignoring posting top.gg server count.");
}

client.on("ready", () => {
    logger.info(`Logged in as ${client.user.tag}!`);
});

client.on("message", async (message: Discord.Message) => {
    if (message.author.equals(client.user) || message.author.bot) return;
    if (!message.guild) return;
    let guildPreference = await getGuildPreference(guildPreferences, message.guild.id);
    let botPrefix = guildPreference.getBotPrefix();
    let parsedMessage = parseMessage(message.content, botPrefix) || null;

    if (message.isMemberMentioned(client.user) && message.content.split(" ").length == 1) {
        // Any message that mentions the bot sends the current options
        commands["options"].call({ message, guildPreference, db });
    }
    if (parsedMessage && commands[parsedMessage.action]) {
        let command = commands[parsedMessage.action];
        if (validate(message, parsedMessage, command.validations, botPrefix)) {
            command.call({
                client,
                gameSessions,
                guildPreference,
                message,
                db,
                parsedMessage,
                botPrefix
            });
        }
    }
    else {
        if (gameSessions[message.guild.id]) {
            guessSong({ client, message, gameSessions, guildPreference, db });
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
                    await gameSession.endRound();
                }
                return;
            }
        }
        // Bot was disconnected voice channel (either via a kick by an admin or the situation handled above)
        if (oldState.user === client.user && !oldUserChannel.members.has(client.user.id)) {
            if (gameSession) {
                logger.info(`gid: ${oldUserChannel.guild.id} | Bot disconnected.`)
                await gameSession.endRound();
            }
        }
    }
});

const getGuildPreference = async (guildPreferences: { [guildId: string]: GuildPreference }, guildID: string): Promise<GuildPreference> => {
    if (!guildPreferences[guildID]) {
        guildPreferences[guildID] = new GuildPreference(guildID);
        logger.info(`New server joined: ${guildID}`);
        await db.kmq("guild_preferences")
            .insert({ guild_id: guildID, guild_preference: JSON.stringify(guildPreferences[guildID]) });
    }
    return guildPreferences[guildID];
}



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

    // load guild preferences
    let fields = await db.kmq("guild_preferences").select("*");
    fields.forEach(async (field) => {
        guildPreferences[field.guild_id] = new GuildPreference(field.guild_id, JSON.parse(field.guild_preference));
        await guildPreferences[field.guild_id].updateGuildPreferences(db.kmq);
    });

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
    .orderBy("name", "DESC")
    fs.writeFileSync(config.groupListFile, result.map((x) => x["name"]).join("\n"));
    client.login(config.botToken);
})();

process.on("unhandledRejection", (reason: Error, p: Promise<any>) => {
    logger.error(`Unhandled Rejection at: Promise ${p}. Reason: ${reason}. Trace: ${reason.stack}`);
});


process.on("uncaughtException", (err: Error) => {
    logger.error(`Uncaught Exception. Reason: ${err}. Trace: ${err.stack}`);
});
