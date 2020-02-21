const RED = 0xE74C3C;
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
                title: `"${gameSession.getSong()}" - ${gameSession.getArtist()}`,
                description: `https://youtube.com/watch?v=${gameSession.getLink()}\n\n**Scoreboard**`,
                image: {
                    url: `https://img.youtube.com/vi/${gameSession.getLink()}/hqdefault.jpg`
                },
                fields: gameSession.scoreboard.getScoreboard()
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
            message.channel.send({
                embed: {
                    color: RED,
                    title: `Game already in session`
                }
            })
            return;
        }
        let query = `SELECT nome as name, name as artist, vlink as youtubeLink FROM app_kpop INNER JOIN app_kpop_group ON app_kpop.id_artist = app_kpop_group.id
        WHERE FIND_IN_SET(members, ?) AND dead = "n" AND publishedon >= "?-01-01" AND vtype = "main"
        ORDER BY app_kpop.views DESC LIMIT ?;`;
        db.query(query, [gameSession.getSQLGender(), gameSession.getBeginningCutoffYear(), gameSession.getLimit()])
        .then((result) => {
            let random = result[Math.floor(Math.random() * result.length)];
            gameSession.startRound(random.name, random.artist, random.youtubeLink);
            playSong(gameSession, message);
        })
        .catch((err) => {
            console.log(err);
            message.channel.send(err.toString());
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
