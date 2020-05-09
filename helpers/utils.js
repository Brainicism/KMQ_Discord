const EMBED_INFO_COLOR = 0x000000; // BLACK
const EMBED_ERROR_COLOR = 0xE74C3C; // RED
const SONG_CACHE_DIR = require("../config.json").songCacheDir;
const ytdl = require("ytdl-core");
const fetchVideoInfo = require("youtube-info");
const hangulRomanization = require("hangul-romanization");
const fs = require("fs");
const logger = require("../logger")("utils")

const startGame = async (gameSession, guildPreference, db, message) => {
    if (gameSession.gameInSession()) {
        sendErrorMessage(message, `Game already in session`, null);
        return;
    }
    let query = `SELECT nome as name, name as artist, vlink as youtubeLink FROM kpop_videos.app_kpop INNER JOIN kpop_videos.app_kpop_group ON kpop_videos.app_kpop.id_artist = kpop_videos.app_kpop_group.id
    WHERE FIND_IN_SET(members, ?) AND dead = "n" AND publishedon >= "?-01-01" AND vtype = "main"
    ORDER BY kpop_videos.app_kpop.views DESC LIMIT ?;`;
    try {
        let result = await db.query(query, [guildPreference.getSQLGender(), guildPreference.getBeginningCutoffYear(), guildPreference.getLimit()])
        let random = result[Math.floor(Math.random() * result.length)];
        gameSession.startRound(random.name, random.artist, random.youtubeLink);
        playSong(gameSession, guildPreference, db, message);
        logger.info(`${getDebugContext(message)} | Playing song: ${gameSession.getDebugSongDetails()}`);
    }
    catch (err) {
        sendErrorMessage(message, "KMQ database query error", err.toString());
        logger.error(`${getDebugContext(message)} | Error querying song: ${err}`);
    }
}
const sendSongMessage = (message, gameSession, isForfeit) => {
    message.channel.send({
        embed: {
            color: EMBED_INFO_COLOR,
            author: {
                name: isForfeit ? null : message.author.username,
                icon_url: isForfeit ? null : message.author.avatarURL()
            },
            title: `"${gameSession.getSong()}" - ${gameSession.getArtist()}`,
            description: `https://youtube.com/watch?v=${gameSession.getVideoID()}\n\n**Scoreboard**`,
            image: {
                url: `https://img.youtube.com/vi/${gameSession.getVideoID()}/hqdefault.jpg`
            },
            fields: gameSession.scoreboard.getScoreboard()
        }
    })
}
const sendInfoMessage = (message, title, description) => {
    message.channel.send({
        embed: {
            color: EMBED_INFO_COLOR,
            author: {
                name: message.author.username,
                icon_url: message.author.avatarURL()
            },
            title: `**${title}**`,
            description: description
        }
    });
}
const sendErrorMessage = (message, title, description) => {
    message.channel.send({
        embed: {
            color: EMBED_ERROR_COLOR,
            author: {
                name: message.author.username,
                icon_url: message.author.avatarURL()
            },
            title: `**${title}**`,
            description: description
        }
    });
}
const getDebugContext = (message) => {
    return `gid: ${message.guild.id}, uid: ${message.author.id}`
}
module.exports = {
    EMBED_INFO_COLOR,
    EMBED_ERROR_COLOR,

    startGame,
    sendSongMessage,
    getDebugContext,
    sendInfoMessage,
    sendErrorMessage,

    sendScoreboard: (message, gameSession) => {
        message.channel.send({
            embed: {
                color: EMBED_INFO_COLOR,
                title: "**Results**",
                fields: gameSession.scoreboard.getScoreboard()
            }
        })
    },
    disconnectVoiceConnection: (client, message) => {
        let voiceConnection = client.voice.connections.get(message.guild.id);
        if (voiceConnection) {
            logger.info(`${getDebugContext(message)} | Disconnected from voice channel`);
            voiceConnection.disconnect();
            return;
        }
    },
    getUserIdentifier: (user) => {
        return `${user.username}#${user.discriminator}`
    },
    cleanSongName: (name) => {
        let cleanName = name.toLowerCase()
            .split("(")[0]
            .normalize("NFD")
            .replace(/[^\x00-\x7F|]/g, "")
            .replace(/|/g, "")
            .replace(/ /g, "").trim();
        if (!cleanName) {
            // Odds are the song name is in hangul
            let hangulRomanized = hangulRomanization.convert(name);
            logger.debug(`cleanSongName result is empty, assuming hangul. Before: ${name}. After: ${hangulRomanized}`)
            return hangulRomanized;
        }
        return cleanName;
    },
    areUserAndBotInSameVoiceChannel: (message) => {
        return message.member.voice.channel === message.guild.voice.channel;
    },
    getNumParticipants: (message) => {
        // Don't include the bot as a participant
        return message.member.voice.channel.members.size - 1;
    },
    clearPartiallyCachedSongs: () => {
        logger.debug("Clearing partially cached songs");
        if (!fs.existsSync(SONG_CACHE_DIR)) {
            return;
        }
        fs.readdir(SONG_CACHE_DIR, (error, files) => {
            if (error) {
                return logger.error(error);
            }

            const endingWithPartRegex = new RegExp('\\.part$');
            const partFiles = files.filter((file) => file.match(endingWithPartRegex));
            partFiles.forEach((partFile) => {
                fs.unlink(`${SONG_CACHE_DIR}/${partFile}`, (err) => {
                    if (err) {
                        logger.error(err);
                    }
                })
            })
            if (partFiles.length) {
                logger.debug(`${partFiles.length} stale cached songs deleted.`);
            }
        });
    }
}

const playSong = (gameSession, guildPreference, db, message) => {
    let voiceChannel = message.member.voice.channel;
    const streamOptions = {
        volume: guildPreference.getStreamVolume(),
        bitrate: voiceChannel.bitrate
    };

    const cacheStreamOptions = {
        volume: guildPreference.getCachedStreamVolume(),
        bitrate: voiceChannel.bitrate
    };

    if (!fs.existsSync(SONG_CACHE_DIR)) {
        fs.mkdirSync(SONG_CACHE_DIR)
    }

    const ytdlOptions = {
        filter: "audioonly",
        quality: "highest"
    };

    const cachedSongLocation = `${SONG_CACHE_DIR}/${gameSession.getVideoID()}.mp3`;
    gameSession.isSongCached = fs.existsSync(cachedSongLocation);
    if (!gameSession.isSongCached) {
        logger.debug(`${getDebugContext(message)} | Downloading uncached song: ${gameSession.getDebugSongDetails()}`);
        const tempLocation = `${cachedSongLocation}.part`;
        if (!fs.existsSync(tempLocation)) {
            let cacheStream = fs.createWriteStream(tempLocation);
            ytdl(gameSession.getVideoID(), ytdlOptions)
                .pipe(cacheStream);
            cacheStream.on('finish', () => {
                fs.rename(tempLocation, cachedSongLocation, (error) => {
                    if (error) {
                        logger.error(`Error renaming temp song file from ${tempLocation} to ${cachedSongLocation}. err = ${error}`);
                    }
                    logger.info(`Successfully cached song ${gameSession.getDebugSongDetails()}`);
                })
            })
        }
    }

    voiceChannel.join().then(connection => {
        // We are unable to pipe the above ytdl stream into Discord.js's play
        // because it terminates the download when the dispatcher is destroyed
        // (i.e when a song is skipped)
        gameSession.dispatcher = connection.play(
            gameSession.isSongCached ? cachedSongLocation : ytdl(gameSession.getVideoID(), ytdlOptions),
            gameSession.isSongCached ? cacheStreamOptions : streamOptions);
        logger.info(`${getDebugContext(message)} | Playing song in voice connection. cached = ${gameSession.isSongCached}. song = ${gameSession.getDebugSongDetails()}`);
        gameSession.dispatcher.on('finish', () => {
            sendSongMessage(message, gameSession, true);
            gameSession.endRound();
            logger.info(`${getDebugContext(message)} | Song finished without being guessed. song = ${gameSession.getDebugSongDetails()}`);
            startGame(gameSession, guildPreference, db, message);
        })
    }).catch((err) => {
        logger.error(`${getDebugContext(message)} | Error playing song in voice connection. cached = ${gameSession.isSongCached}. song = ${gameSession.getDebugSongDetails()} err = ${err}`);
        // Attempt to restart game with different song
        sendSongMessage(message, gameSession, true);
        gameSession.endRound();
        startGame(gameSession, guildPreference, db, message);
    })
}
