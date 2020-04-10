const Discord = require("discord.js");
const config = require("./config.json");
const mysql = require("promise-mysql");

const GuildPreference = require("./models/guild_preference.js");
const fs = require("fs");
const client = new Discord.Client();
const guessSong = require("./helpers/guess_song");
const validate = require("./helpers/validate");
let db;
let commands = {};
let gameSessions = {};
let guildPreferences = {};

client.on("ready", () => {
    console.log(`Logged in as ${client.user.tag}!`);
});

client.on("message", (message) => {
    if (message.author.equals(client.user) || message.author.bot) return;
    if (!guildPreferences[message.guild.id]) {
        guildPreferences[message.guild.id] = new GuildPreference();
        let guildPreferencesInsert = `INSERT INTO guildPreferences VALUES(?, ?)`;
        db.query(guildPreferencesInsert, [message.guild.id, JSON.stringify(guildPreferences[message.guild.id])]);
    }

    let guildPreference = guildPreferences[message.guild.id];

    let botPrefix = guildPreference.getBotPrefix();
    let parsedMessage = parseMessage(message.content, botPrefix) || null;

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
            let guildPreferencesUpdate = `UPDATE guildPreferences SET guildPreference = ? WHERE guildID = ?;`;
            db.query(guildPreferencesUpdate, [JSON.stringify(guildPreference), message.guild.id]);
        }
    }
    else {
        if (gameSessions[message.guild.id]) {
            guessSong({ client, message, gameSessions, db });
        }
    }
});

client.on("voiceStateUpdate", (oldState, newState) => {
    let oldUserChannel = oldState.voiceChannel;
    let newUserChannel = newState.voiceChannel;
    if (newUserChannel === undefined) {
        // User left voice channel, check if bot is only one left
        if (oldUserChannel.members.size === 1) {
            let guildID = oldUserChannel.guild.id;
            let voiceConnection = client.voiceConnections.get(guildID);
            if (voiceConnection) {
                voiceConnection.disconnect();
                let gameSession = gameSessions[guildID];
                gameSession.endRound();
                return;
            }
        }
    }
});

const parseMessage = (message, botPrefix) => {
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
    db = await mysql.createConnection({
        host: "localhost",
        user: config.dbUser,
        password: config.dbPassword,
        database: "kmq"
    });
    if (!config.botToken || config.botToken === "YOUR BOT TOKEN HERE") {
        console.error("No bot token set. Please update config.json!")
        process.exit(1);
    }
    let guildPreferencesTableCreation = `CREATE TABLE IF NOT EXISTS guildPreferences(
        guildID TEXT NOT NULL,
        guildPreference JSON NOT NULL
    );`;

    db.query(guildPreferencesTableCreation).catch((err) => {
        console.error(err);
    });

    db.query(`SELECT * FROM guildPreferences`, (results, fields) => {
        fields.forEach((field) => {
            guildPreferences[field.guildID] = new GuildPreference(JSON.parse(field.guildPreference));
        });
    }).catch((err) => {
        console.error(err);
    });

    client.login(config.botToken);

    fs.readdir("./commands/", (err, files) => {
        if (err) return console.error(err);
        files.forEach(file => {
            if (!file.endsWith(".js")) return;
            let command = require(`./commands/${file}`);
            let commandName = file.split(".")[0];
            commands[commandName] = command;
        });
    });
})();
