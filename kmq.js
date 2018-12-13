const Discord = require("discord.js");
const sqlite3 = require("sqlite3").verbose();
const config = require("./config.json");
const GameSession = require("./game_session.js");
const client = new Discord.Client();
const botPrefix = "!";
const RED = 15158332;

const sendScoreboard = require("./utils.js").sendScoreboard
const sendSongMessage = require("./utils.js").sendSongMessage
const disconnectVoiceConnection = require("./utils.js").disconnectVoiceConnection
const startGame = require("./utils.js").startGame
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

client.on("message", (message) => {
    if (message.author.equals(client.user)) return;
    let command = parseCommand(message.content) || null;

    if (!gameSessions[message.guild.id]) {
        gameSessions[message.guild.id] = new GameSession();
    }

    let gameSession = gameSessions[message.guild.id];
    if (command) {
        if (command.action === "stop") {
            require("./commands/stop.js")(gameSession, client, message);
        }
        else if (command.action === "random") {
            require("./commands/random.js")(message, db, gameSession);
        }
        else if (command.action === "help") {
            require("./commands/help.js")(client, command, message);
        }
        else if (command.action === "end") {
            require("./commands/end.js")(client, gameSession, command, message);
        }
        else if (command.action === "cutoff") {
            require("./commands/cutoff.js")(message, command, gameSession);
        }
    }
    else {
        let guess = cleanSongName(message.content);
        if (gameSession.getSong() && guess === cleanSongName(gameSession.getSong())) {
            // this should be atomic
            let userTag = getUserIdentifier(message.author);
            gameSession.scoreboard.updateScoreboard(userTag, message.author.id);
            sendSongMessage(message, gameSession, false);
            sendScoreboard(message, gameSession);
            disconnectVoiceConnection(client, message);
            gameSession.endRound();
        }
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

const cleanSongName = (name) => {
    return name.toLowerCase().split("(")[0].replace(/[^\x00-\x7F|]/g, "").replace(/|/g, "").replace(/ /g, "").trim();
}

const getUserIdentifier = (user) => {
    return `${user.username}#${user.discriminator}`
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
