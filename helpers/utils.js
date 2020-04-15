const RED = 0xE74C3C;
const ytdl = require("ytdl-core");
const fetchVideoInfo = require("youtube-info");
const hangulRomanization = require('hangul-romanization');

const startGame = (gameSession, guildPreference, db, message) => {
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
    db.query(query, [guildPreference.getSQLGender(), guildPreference.getBeginningCutoffYear(), guildPreference.getLimit()])
    .then((result) => {
        let random = result[Math.floor(Math.random() * result.length)];
        gameSession.startRound(random.name, random.artist, random.youtubeLink);
        playSong(gameSession, guildPreference, db, message);
    })
    .catch((err) => {
        console.log(err);
        message.channel.send(err.toString());
    })
}
const sendSongMessage = (message, gameSession, isForfeit) => {
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
}

module.exports = {
    startGame,
    sendSongMessage,
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
        let voiceConnection = client.voice.connections.get(message.guild.id);
        if (voiceConnection) {
            voiceConnection.disconnect();
            return;
        }
    },
    getUserIdentifier: (user) => {
        return `${user.username}#${user.discriminator}`
    },
    cleanSongName: (name) => {
        let cleanName =  name.toLowerCase()
            .split("(")[0]
           .normalize("NFD")
           .replace(/[^\x00-\x7F|]/g, "")
           .replace(/|/g, "")
           .replace(/ /g, "").trim();
        if (!cleanName) {
            // Odds are the song name is in hangul
            return hangulRomanization.convert(name);
        }
        return cleanName;
    },
    areUserAndBotInSameVoiceChannel: (message) => {
        return message.member.voice.channel === message.guild.voice.channel;
    },
    getNumParticipants: (message) => {
        // Don't include the bot as a participant
        return message.member.voice.channel.members.size - 1;
    }
}

const playSong = (gameSession, guildPreference, db, message) => {
    let voiceChannel = message.member.voice.channel;
    const streamOptions = { volume: guildPreference.getVolume(), bitrate: voiceChannel.bitrate };
    voiceChannel.join().then(connection => {
        let options = { filter: "audioonly", quality: "highest", highWaterMark: 1 << 25 };
        const stream = ytdl(gameSession.getLink(), options);
        gameSession.dispatcher = connection.play(stream, streamOptions);
        gameSession.dispatcher.on('finish', () => {
            sendSongMessage(message, gameSession, true);
            gameSession.endRound();
            startGame(gameSession, guildPreference, db, message);
        })
    }).catch((err) => {
        console.error(err);
        // Attempt to restart game with different song
        sendSongMessage(message, gameSession, true);
        gameSession.endRound();
        startGame(gameSession, guildPreference, db, message);
    })
}
