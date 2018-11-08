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
var scoreboard = {};
var currentSong = null;
var currentArtist = null;
var gameInSession = false;
client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
});
client.on('message', message => {
    if (message.author.equals(client.user)) return;
    let command = parseCommand(message.content) || null;
    if (command) {
        if (command.action === "stop") {
            gameInSession = false;
            message.channel.send("The correct song was: " + currentSong + " by " + currentArtist);
            disconnectVoiceConnection(message);
        }
        else if (command.action === "random") {
            startGame(message);
        }
    }
    else {
        let guess = cleanSongName(message.content);
        if (currentSong && guess === cleanSongName(currentSong)) {
            //this should be atomic
            scoreboard[getUserIdentifier(message.author)] = (scoreboard[getUserIdentifier(message.author)] || 0) + 1;
            message.channel.send("Correct answer was: " + currentSong + " by " + currentArtist + "\n" + JSON.stringify(scoreboard));
            gameInSession = false;
            currentSong = null;
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
        console.log(currentSong);
        fetchVideoInfo(random.youtube_link, (err, videoInfo) => {
            playSong(random.youtube_link, videoInfo.duration, message);
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