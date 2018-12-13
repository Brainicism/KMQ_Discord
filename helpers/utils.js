const RED = 15158332;
const ytdl = require("ytdl-core");
const fetchVideoInfo = require("youtube-info");

module.exports = {
    sendSongMessage: (message, gameSession, isForfeit) => {
        message.channel.send({
            embed: {
                color: RED,
                author: {
                    name: isForfeit ? null : message.author.username,
                    icon_url: isForfeit ? null : message.author.avatarURL
                },
                title: `${gameSession.getSong()} - ${gameSession.getArtist()}`,
                description: `https://youtube.com/watch?v=${gameSession.getLink()}`,
                image: {
                    url: `https://img.youtube.com/vi/${gameSession.getLink()}/hqdefault.jpg`
                }
            }
        })
    },
    sendScoreboard: (message, gameSession) => {
        message.channel.send({
            embed: {
                color: RED,
                title: "**Results**",
                fields: gameSession.scoreboard.getScoreboard()
            }
        })
    },
    disconnectVoiceConnection: (client, message) => {
        let voiceConnection = client.voiceConnections.get(message.guild.id);
        if (voiceConnection) {
            voiceConnection.disconnect();
            return;
        }
    },
    startGame: (gameSession, db, message) => {
        if (gameSession.gameInSession()) {
            message.channel.send("Game already in session.");
            return;
        }

        let query = `SELECT videos.youtube_link as youtubeLink, videos.name, DATE(videos.publish_date) as date, artists.name as artist, videos.video_type as video_type, videos.dead as dead FROM videos INNER JOIN artists on videos.artistID = artists.id WHERE gender = "female" AND video_type = "main" AND dead = "n" AND date >= '${gameSession.getBeginningCutoffYear()}-01-01' ORDER BY views DESC LIMIT 500`;
        db.all(query, (err, rows) => {
            if (err) console.error(err);
            let random = rows[Math.floor(Math.random() * rows.length)];
            gameSession.startRound(random.name, random.artist, random.youtubeLink);
            fetchVideoInfo(gameSession.getLink(), (err, videoInfo) => {
                console.log(random)
                playSong(gameSession, message);
            })
        })
    },
    getUserIdentifier: (user) => {
        return `${user.username}#${user.discriminator}`
    },
    cleanSongName: (name) => {
        return name.toLowerCase().split("(")[0].replace(/[^\x00-\x7F|]/g, "").replace(/|/g, "").replace(/ /g, "").trim();
    }
}
const playSong = (gameSession, message) => {
    let voiceChannel = message.member.voiceChannel;
    const streamOptions = { volume: 0.1 };
    voiceChannel.join().then(connection => {
        let options = { filter: "audioonly", quality: "highest" };
        const stream = ytdl(gameSession.getLink(), options);
        const dispatcher = connection.playStream(stream, streamOptions);
    }).catch((err) => {
        console.error(err);
        // Attempt to restart game with different song
        gameSession.endRound();
        startGame(message);
    })
}