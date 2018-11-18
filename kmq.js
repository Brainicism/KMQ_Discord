const Discord = require('discord.js');
const client = new Discord.Client();
const ytdl = require('ytdl-core');
const botPrefix = '!';
const fetchVideoInfo = require('youtube-info');
const sqlite3 = require('sqlite3').verbose();
const config = require("./config.json")
const db = new sqlite3.Database('./main.db', (err) => {
    if (err) {
        console.error(err);
        return;
    }
});
var scoreboard = [];
var currentSong = null;
var currentArtist = null;
var currentSongLink = null;
var gameInSession = false;

const songInfoMessage = (message, currentSong, currentArtist, currentSongLink, isQuit) => {
    message.channel.send({embed: {
        color: 15158332, // Red
        author: {
            name: isQuit ? null : message.author.username,
            icon_url: isQuit ? null : message.author.avatarURL
        },
        title: currentSong + " - " + currentArtist,
        description: "https://youtube.com/watch?v=" + currentSongLink,
        image: {
            url: "https://img.youtube.com/vi/" + currentSongLink + "/hqdefault.jpg"
        },
    }})
}

const sendScoreboard = (message, scoreboard) => {
    message.channel.send({embed: {
        color: 15158332,
        title: "**Results**",
        fields: scoreboard
    }})
}

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
});

client.on('message', message => {
    if (message.author.equals(client.user)) return;
    let command = parseCommand(message.content) || null;
    if (command) {
        if (command.action === "stop") {
            gameInSession = false;
            songInfoMessage(message, currentSong, currentArtist, currentSongLink, true);
            disconnectVoiceConnection(message);
        }
        else if (command.action === "random") {
            startGame(message);
        }
        else if (command.action === "end") {
            if (scoreboard.length > 0) {
                disconnectVoiceConnection(message);
                message.channel.send(scoreboard[0].name + " wins!");
                sendScoreboard(message, scoreboard);
                scoreboard = [];
            }
        }
    }
    else {
        let guess = cleanSongName(message.content);
        if (currentSong && guess === cleanSongName(currentSong)) {
            //this should be atomic
            let index = -1;
            for (let i = 0; i < scoreboard.length; i++) {
                if (scoreboard[i].name === getUserIdentifier(message.author)) {
                    index = i;
                }
            }

            if (index === -1) {
                // Either scoreboard is empty or user isn't in scoreboard
                scoreboard.push({name: getUserIdentifier(message.author), value: 1});
            }

            else {
                scoreboard[index].value++;
            }

            songInfoMessage(message, currentSong, currentArtist, currentSongLink, false);
            sendScoreboard(message, scoreboard);
            gameInSession = false;
            currentSong = null;
            currentArtist = null
            currentSongLink = null;
            disconnectVoiceConnection(message);
        }
    }
});

const startGame = (message) => {
    if (gameInSession) {
        message.channel.send("Game already in session");
        return;
    }
    gameInSession = true;
    let query = `SELECT videos.youtube_link as youtube_link, videos.name, DATE(videos.publish_date) as date, artists.name as artist FROM videos INNER JOIN artists on videos.artistID = artists.id WHERE gender = "female" ORDER BY views DESC LIMIT 500`;
    db.all(query, (err, rows) => {
        console.log(err);
        let random = rows[Math.floor(Math.random() * rows.length)];
        currentSong = random.name;
        currentArtist = random.artist;
        currentSongLink = random.youtube_link;
        console.log(currentSong);
        fetchVideoInfo(currentSongLink, (err, videoInfo) => {
            playSong(currentSongLink, videoInfo.duration, message);
        })
    })
}

const disconnectVoiceConnection = (message) => {
    let voiceConnection = client.voiceConnections.get(message.guild.id);
    if (voiceConnection) {
        voiceConnection.disconnect();
        return;
    }
    message.channel.send("no vc");
}

const playSong = (link, duration, message) => {
    var voiceChannel = message.member.voiceChannel;
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

client.login(config.bot_token);
