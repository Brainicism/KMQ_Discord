const Discord = require("discord.js");
const config = require("./config.json");
const mysql = require("promise-mysql");

const GameSession = require("./models/game_session.js");
const fs = require("fs");
const client = new Discord.Client();
const botPrefix = config.prefix;
const guessSong = require("./helpers/guess_song")
const validate = require("./helpers/validate");
let db;
let commands = {};
let gameSessions = {};

client.on("ready", () => {
    console.log(`Logged in as ${client.user.tag}!`);
});

client.on("message", (message) => {
    if (message.author.equals(client.user)) return;
    let parsedMessage = parseMessage(message.content) || null;

    if (!gameSessions[message.guild.id]) {
        gameSessions[message.guild.id] = new GameSession();
    }

    let gameSession = gameSessions[message.guild.id];
    gameSession.addParticipant(message.author);
    if (parsedMessage && commands[parsedMessage.action]) {
        let command = commands[parsedMessage.action];
        if (validate(message, parsedMessage, command.validations)) {
            command.call({ client, gameSession, message, db, parsedMessage })
        }
    }
    else {
        guessSong({ client, message, gameSession, db });
    }
});

const parseMessage = (message) => {
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
