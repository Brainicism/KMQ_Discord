import * as Discord from "discord.js";
import * as mysql from "promise-mysql";
import * as DBL from "dblapi.js";
import { validateConfig } from "./config_validator";
import GuildPreference from "./models/guild_preference";
import { guessSong } from "./helpers/game_utils";
import validate from "./helpers/validate";
import { getCommandFiles } from "./helpers/discord_utils";
import { ParsedMessage } from "types";
import * as _config from "../config/app_config.json";
import { Pool } from "promise-mysql";
import BaseCommand from "commands/base_command";
import GameSession from "models/game_session";
import _logger from "./logger";
const logger = _logger("kmq");

const client = new Discord.Client();

const config: any = _config;
let db: Pool;
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

client.on("message", (message: Discord.Message) => {
    if (message.author.equals(client.user) || message.author.bot) return;
    message.
    let guildPreference = getGuildPreference(guildPreferences, message.guild.id);
    let botPrefix = guildPreference.getBotPrefix();
    let parsedMessage = parseMessage(message.content, botPrefix) || null;

    if (message.mentions.has(client.user) && message.content.split(" ").length == 1) {
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

client.on("voiceStateUpdate", (oldState, newState) => {
    let oldUserChannel = oldState.channel;
    let newUserChannel = newState.channel;
    if (!newUserChannel) {
        let guildID = oldUserChannel.guild.id;
        let gameSession = gameSessions[guildID];
        // User left voice channel, check if bot is only one left
        if (oldUserChannel.members.size === 1) {
            let voiceConnection = client.voice.connections.get(guildID);
            if (voiceConnection) {
                voiceConnection.disconnect();
                if (gameSession) {
                    gameSession.endRound();
                }
                return;
            }
        }
        // Bot was disconnected by another user
        if (!oldUserChannel.members.has(client.user.id)) {
            if (gameSession) {
                gameSession.endRound();
            }
        }
    }
});

const getGuildPreference = (guildPreferences: { [guildId: string]: GuildPreference }, guildID: string): GuildPreference => {
    if (!guildPreferences[guildID]) {
        guildPreferences[guildID] = new GuildPreference(guildID);
        logger.info(`New server joined: ${guildID}`);
        let guildPreferencesInsert = `INSERT INTO kmq.guild_preferences VALUES(?, ?)`;
        db.query(guildPreferencesInsert, [guildID, JSON.stringify(guildPreferences[guildID])]);
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
    if (!validateConfig(config)) {
        logger.error("Invalid config, aborting.");
        process.exit(1);
    }

    db = await mysql.createPool({
        connectionLimit: 10,
        host: "localhost",
        user: config.dbUser,
        password: config.dbPassword
    });

    let guildPreferencesTableCreation = `CREATE TABLE IF NOT EXISTS kmq.guild_preferences(
        guild_id TEXT NOT NULL,
        guild_preference JSON NOT NULL
    );`;

    await db.query(guildPreferencesTableCreation);

    let fields = await db.query(`SELECT * FROM kmq.guild_preferences`);
    fields.forEach((field) => {
        guildPreferences[field.guild_id] = new GuildPreference(field.guild_id, JSON.parse(field.guild_preference));
    });
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
    client.login(config.botToken);
})();
