const Discord = require("discord.js");
const ytdl = require("ytdl-core");
const fetchVideoInfo = require("youtube-info");
const sqlite3 = require("sqlite3").verbose();
const config = require("./config.json")
const GameSession = require("./game-session.js")
const helpMessages = require('./help_strings.json');
const client = new Discord.Client();
const botPrefix = "!";
const RED = 15158332;
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
            if (gameSession.gameInSession()) {
                sendSongMessage(message, true);
                disconnectVoiceConnection(message);
                gameSession.endRound();
            }
        }
        else if (command.action === "random") {
            if (!message.member.voiceChannel) {
                message.channel.send("Send `!random` again when you are in a voice channel.");
            }
            else {
                startGame(message);
            }
        }
        else if (command.action === "help") {
            help(message, command.argument);
        }
        else if (command.action === "end") {
            if (!gameSession.scoreboard.isEmpty()) {
                if (gameSession.gameInSession()) sendSongMessage(message, true);
                disconnectVoiceConnection(message);
                message.channel.send(gameSession.scoreboard.getWinnerMessage());
                sendScoreboard(message, gameSession.scoreboard);
                gameSession.endGame();
            }
        }
    }
    else {
        let guess = cleanSongName(message.content);
        if (gameSession.getSong() && guess === cleanSongName(gameSession.getSong())) {
            // this should be atomic
            let userTag = getUserIdentifier(message.author);
            gameSession.scoreboard.updateScoreboard(userTag, message.author.id);

            sendSongMessage(message, false);
            sendScoreboard(message, gameSession.scoreboard);
            disconnectVoiceConnection(message);
            gameSession.endRound();
        }
    }
});

// Usage: `!help [action]` or `!help`
const help = (message, action) => {
    let embedTitle = "";
    let embedDesc = "";
    let embedFields = [];
    if (action) {
        let helpActionList = helpMessages.actions.map(a => a.name);
        if (!helpActionList.includes(action)) {
            message.channel.send("Sorry, there is no documentation on " + action);
            return;
        }

        let detailedAction = helpMessages.actions.find(a => a.name === action)
        embedTitle = detailedAction.name;
        embedDesc = detailedAction.description;
        detailedAction.arguments.forEach((argument) => {
            embedFields.push({
                name: argument.name,
                value: argument.description
            })
        });
    }
    else {
        embedTitle = "KMQ Command Help"
        embedDesc = helpMessages.rules
        helpMessages.actions.forEach((action) => {
            embedFields.push({
                name: action.name,
                value: action.description + " Usage: " + action.usage
            })
        });
    }

    message.channel.send({
        embed: {
            title: embedTitle,
            description: embedDesc,
            fields: embedFields
        }
    })
}

const startGame = (message) => {

    let gameSession = gameSessions[message.guild.id];

    if (gameSession.gameInSession()) {
        message.channel.send("Game already in session.");
        return;
    }

    let query = `SELECT videos.youtube_link as youtubeLink, videos.name, DATE(videos.publish_date) as date, artists.name as artist, videos.video_type as video_type, videos.dead as dead FROM videos INNER JOIN artists on videos.artistID = artists.id WHERE gender = "female" AND video_type = "main" AND dead = "n" ORDER BY views DESC LIMIT 500`;
    db.all(query, (err, rows) => {
        if (err) console.error(err);
        let random = rows[Math.floor(Math.random() * rows.length)];
        gameSession.startRound(random.name, random.artist, random.youtubeLink);
        fetchVideoInfo(gameSession.getLink(), (err, videoInfo) => {
            playSong(gameSession.getLink(), message);
        })
    })
}

const sendSongMessage = (message, isForfeit) => {
    let gameSession = gameSessions[message.guild.id];
    message.channel.send({
        embed: {
            color: RED,
            author: {
                name: isForfeit ? null : message.author.username,
                icon_url: isForfeit ? null : message.author.avatarURL
            },
            title: `${gameSession.getSong()} - ${gameSession.getArtist()}`,
            description: `https://youtube.com/watch?v=${gameSession.link}`,
            image: {
                url: `https://img.youtube.com/vi/${gameSession.getLink()}/hqdefault.jpg`
            }
        }
    })
}

const sendScoreboard = (message, scoreboard) => {
    let gameSession = gameSessions[message.guild.id];
    message.channel.send({
        embed: {
            color: RED,
            title: "**Results**",
            fields: gameSession.scoreboard.getScoreboard()
        }
    })
}

const disconnectVoiceConnection = (message) => {
    let voiceConnection = client.voiceConnections.get(message.guild.id);
    if (voiceConnection) {
        voiceConnection.disconnect();
        return;
    }
}

const playSong = (link, message) => {
    let voiceChannel = message.member.voiceChannel;
    let gameSession = gameSessions[message.guild.id];
    const streamOptions = { volume: 0.1 };
    voiceChannel.join().then(connection => {
        let options = { filter: "audioonly", quality: "highest" };
        const stream = ytdl(link, options);
        const dispatcher = connection.playStream(stream, streamOptions);
    }).catch((err) => {
        console.error(err);
        // Attempt to restart game with different song
        gameSession.endRound();
        startGame(message);
    })
}

const parseCommand = (message) => {
    if (message.charAt(0) !== botPrefix) return null;
    let components = message.split(" ");
    let action = components.shift().substring(1);
    let argument = components.join(" ");
    return {
        action,
        argument,
        message
    }
}

const cleanSongName = (name) => {
    return name.toLowerCase().split("(")[0].replace(/[^\x00-\x7F|]/g, "").replace(/|/g, "").replace(/ /g, "").trim();
}

const getUserIdentifier = (user) => {
    return `${user.username}#${user.discriminator}`
}

(() => {
    if (!config.botToken) {
        console.error("No bot token set. Please update config.json!")
        process.exit(1);
    }
    else {
        client.login(config.botToken);
    }
})();
