const Discord = require("discord.js");
const sqlite3 = require("sqlite3").verbose();
const config = require("./config.json");
const GameSession = require("./models/game_session.js");
const fs = require("fs");
const client = new Discord.Client();
const botPrefix = "!";
const guessSong = require("./helpers/guess_song")
let commands = {};
const db = new sqlite3.Database("./main.db", (err) => {
    if (err) {
        console.error(err);
        return;
    }
});

let gameSessions = {};

client.on("ready", () => {
    console.log(`Logged in as ${client.user.tag}!`);
});

fs.readdir("./commands/", (err, files) => {
    if (err) return console.error(err);
    files.forEach(file => {
        if (!file.endsWith(".js")) return;
        let command = require(`./commands/${file}`);
        let commandName = file.split(".")[0];
        commands[commandName] = command;
    });
});

client.on("message", (message) => {
    if (message.author.equals(client.user)) return;
    let command = parseCommand(message.content) || null;

    if (!gameSessions[message.guild.id]) {
        gameSessions[message.guild.id] = new GameSession();
    }

    let gameSession = gameSessions[message.guild.id];
    if (command && commands[command.action]) {
        commands[command.action]({ client, gameSession, message, db, command })
    }
    else {
        guessSong({ client, message, gameSession });
    }
});


const parseCommand = (message) => {
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

(() => {
    if (!config.botToken || config.botToken === "YOUR BOT TOKEN HERE") {
        console.error("No bot token set. Please update config.json!")
        process.exit(1);
    }
    else {
        client.login(config.botToken);
    }
})();
