const Discord = require('discord.js');
const ytdl = require('ytdl-core');
const fetchVideoInfo = require('youtube-info');
const sqlite3 = require('sqlite3').verbose();
const config = require("./config.json")
const client = new Discord.Client();
const botPrefix = '!';
const RED = 15158332;
const db = new sqlite3.Database('./main.db', (err) => {
    if (err) {
        console.error(err);
        return;
    }
});
const helpMessages = require('./help_strings.json');
var currentSong = null;
var currentArtist = null;
var currentSongLink = null;
var gameInSession = false;
var scoreboard = {};


client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
});

client.on('message', (message) => {
    if (message.author.equals(client.user)) return;
    let command = parseCommand(message.content) || null;
    if (command) {
        if (command.action === "stop") {
            if (gameInSession) {
                sendSongMessage(message, true);
                disconnectVoiceConnection(message);
                resetGameState();
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
            if (Object.keys(scoreboard).length) {
                disconnectVoiceConnection(message);
                message.channel.send(`${Object.keys(scoreboard)[0]} wins!`);
                sendScoreboard(message, scoreboard);
                resetGameState();
                scoreboard = {};
            }
        }
    }
    else {
        let guess = cleanSongName(message.content);
        if (currentSong && guess === cleanSongName(currentSong)) {
            // this should be atomic
            let userID = getUserIdentifier(message.author);
            if (!scoreboard[userID]) {
                scoreboard[userID] = ({name: userID, value: 1});
            }
            else {
                scoreboard[userID].value++;
            }

            sendSongMessage(message, false);
            sendScoreboard(message, scoreboard);
            resetGameState();
            disconnectVoiceConnection(message);
        }
    }
});

// Usage: `!help [action]` or `!help`
const help = (message, action) => {
    let embed_title = "";
    let embed_desc = "";
    let embed_fields = [];
    if (action) {
        let helpActionList = helpMessages.actions.map(a => a.name);
        if (!helpActionList.includes(action)) {
            message.channel.send("Sorry, there is no documentation on " + action);
            return;
        }

        let detailedAction = helpMessages.actions.find(a => a.name === action)
        embed_title = detailedAction.name;
        embed_desc = detailedAction.description.join("");
        detailedAction.arguments.forEach((argument) => {
            embed_fields.push({
                name: argument.name,
                value: argument.description.join("")
            })
        });
    }
    else {
        embed_title = "KMQ Command Help"
        embed_desc = helpMessages.rules.join("")
        helpMessages.actions.forEach((action) => {
            embed_fields.push({
                name: action.name,
                value: action.description.join("") + " Usage: " + action.usage
            })
        });
    }

    message.channel.send({embed: {
            title: embed_title,
            description: embed_desc,
            fields: embed_fields
        }
    })
}

const startGame = (message) => {
    if (gameInSession) {
        message.channel.send("Game already in session");
        return;
    }
    gameInSession = true;
    let query = `SELECT videos.youtube_link as youtube_link, videos.name, DATE(videos.publish_date) as date, artists.name as artist FROM videos INNER JOIN artists on videos.artistID = artists.id WHERE gender = "female" ORDER BY views DESC LIMIT 500`;
    db.all(query, (err, rows) => {
        if (err) console.error(err);
        let random = rows[Math.floor(Math.random() * rows.length)];
        currentSong = random.name;
        currentArtist = random.artist;
        currentSongLink = random.youtube_link;
        fetchVideoInfo(currentSongLink, (err, videoInfo) => {
            playSong(currentSongLink, videoInfo.duration, message);
        })
    })
}

const sendSongMessage = (message, isQuit) => {
    message.channel.send({embed: {
        color: RED,
        author: {
            name: isQuit ? null : message.author.username,
            icon_url: isQuit ? null : message.author.avatarURL
        },
        title: `${currentSong} - ${currentArtist}`,
        description: `https://youtube.com/watch?v=${currentSongLink}`,
        image: {
            url: `https://img.youtube.com/vi/${currentSongLink}/hqdefault.jpg`
        }
    }})
}

const sendScoreboard = (message, scoreboard) => {
    var scoreboardArr = Object.keys(scoreboard).map(x => {
        return {name: x, value: scoreboard[x].value}
    })
    message.channel.send({embed: {
        color: RED,
        title: "**Results**",
        fields: Object.keys(scoreboard).map(x => {
            return {name: x, value: scoreboard[x].value}
        })
        .sort((a, b) => { return b.value - a.value })
    }})
}

const disconnectVoiceConnection = (message) => {
    let voiceConnection = client.voiceConnections.get(message.guild.id);
    if (voiceConnection) {
        voiceConnection.disconnect();
        return;
    }
}

const playSong = (link, duration, message) => {
    var voiceChannel = message.member.voiceChannel;
    console.log("Voice channel: " + voiceChannel.name);
    const streamOptions = { volume: 0.1 };
    voiceChannel.join().then(connection => {
        let options = { begin: duration / 2, quality: 'highest' };
        const stream = ytdl(link, options);
        const dispatcher = connection.playStream(stream, streamOptions);
    }).catch(err => console.log(err));
}

const parseCommand = (message) => {
    if (message.charAt(0) !== botPrefix) return null;
    let components = message.split(' ');
    let action = components.shift().substring(1);
    let argument = components.join(' ');
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

const resetGameState = () => {
    // Note: scoreboard is reset manually when !end is called
    currentSong = null;
    currentArtist = null;
    currentSongLink = null;
    gameInSession = false;
}

if (!config.bot_token) {
    console.error("No bot token set. Please update config.json!")
    process.exit(1);
}
else {
    client.login(config.bot_token);
}
