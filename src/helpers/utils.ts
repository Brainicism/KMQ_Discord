const SONG_CACHE_DIR = require("../../config/app_config.json").songCacheDir;
import * as ytdl from "ytdl-core";
import * as fetchVideoInfo from "youtube-info";
import * as hangulRomanization from "hangul-romanization";
import * as fs from "fs";
import { Pool } from "promise-mysql"
const logger = require("../logger")("utils")
import * as path from "path";
import * as Discord from "discord.js";
import GuildPreference from "models/guild_preference";
import GameSession from "../models/game_session";
const EMBED_INFO_COLOR = 0x000000; // BLACK
const EMBED_ERROR_COLOR = 0xE74C3C; // RED
const GameOptions = { "GENDER": "Gender", "CUTOFF": "Cutoff", "LIMIT": "Limit", "VOLUME": "Volume" };

const startGame = async (gameSession: GameSession, guildPreference: GuildPreference, db: Pool, message: Discord.Message, client: Discord.Client) => {
    if (!gameSession || gameSession.finished) {
        return;
    }
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
        playSong(gameSession, guildPreference, db, message, client);
        logger.info(`${getDebugContext(message)} | Playing song: ${gameSession.getDebugSongDetails()}`);
    }
    catch (err) {
        sendErrorMessage(message, "KMQ database query error", err.toString());
        logger.error(`${getDebugContext(message)} | Error querying song: ${err}`);
    }
}
const sendSongMessage = (message: Discord.Message, gameSession: GameSession, isForfeit: boolean) => {
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
const sendInfoMessage = (message: Discord.Message, title: string, description: string, footerText: string, footerImageWithPath: string) => {
    let embed = new Discord.MessageEmbed({
        color: EMBED_INFO_COLOR,
        author: {
            name: message.author.username,
            icon_url: message.author.avatarURL()
        },
        title: `**${title}**`,
        description: description
    })

    if (footerImageWithPath) {
        embed.attachFiles([footerImageWithPath]);
        let footerImage = path.basename(footerImageWithPath);
        embed.setFooter(footerText, `attachment://${footerImage}`)
    }

    message.channel.send(embed);
}
const sendErrorMessage = (message: Discord.Message, title: string, description: string) => {
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
const getSongCount = async (guildPreference: GuildPreference, db: Pool) => {
    let query = `SELECT count(*) as count FROM kpop_videos.app_kpop INNER JOIN kpop_videos.app_kpop_group ON kpop_videos.app_kpop.id_artist = kpop_videos.app_kpop_group.id
    WHERE FIND_IN_SET(members, ?) AND dead = "n" AND publishedon >= "?-01-01" AND vtype = "main"
    ORDER BY kpop_videos.app_kpop.views DESC LIMIT ?;`;
    try {
        let result = await db.query(query, [guildPreference.getSQLGender(), guildPreference.getBeginningCutoffYear(), guildPreference.getLimit()])
        return result[0].count;
    }
    catch (e) {
        logger.error(`Error retrieving song count. query = ${query} error = ${e}`);
        return -1;
    }
}
const sendOptionsMessage = async (message: Discord.Message, guildPreference: GuildPreference, db: Pool, updatedOption: string) => {
    let cutoffString = `${guildPreference.getBeginningCutoffYear()}`;
    let genderString = `${guildPreference.getSQLGender()}`;
    let limitString = `${guildPreference.getLimit()}`;
    let volumeString = `${guildPreference.getVolume()}`;

    cutoffString = updatedOption == GameOptions.CUTOFF ? bold(cutoffString) : codeLine(cutoffString);
    genderString = updatedOption == GameOptions.GENDER ? bold(genderString) : codeLine(genderString);
    limitString = updatedOption == GameOptions.LIMIT ? bold(limitString) : codeLine(limitString);
    volumeString = updatedOption == GameOptions.VOLUME ? bold(volumeString) : codeLine(volumeString);

    let totalSongs = await getSongCount(guildPreference, db);
    sendInfoMessage(message,
        updatedOption == null ? "Options" : `${updatedOption} updated`,
        `Now playing the ${limitString} out of the __${totalSongs}__ most popular songs  by ${genderString} artists starting from the year ${cutoffString} at ${volumeString}% volume.`,
        updatedOption == null ? `Psst. Your bot prefix is \`${guildPreference.getBotPrefix()}\`.` : null,
        updatedOption == null ? "assets/tsukasa.jpg" : null
    );
}
const getDebugContext = (message: Discord.Message) => {
    return `gid: ${message.guild.id}, uid: ${message.author.id}`
}

const getCommandFiles = () => {
    return new Promise((resolve, reject) => {
        let commandMap = {};
        fs.readdir("./commands", async (err, files) => {
            if (err) {
                reject();
                return logger.error(`Unable to read commands error = ${err}`);
            }
            for (const file of files) {
                let command = await import(`../commands/${file}`);
                let commandName = file.split(".")[0];
                commandMap[commandName] = new command.default()
            }
            resolve(commandMap);
        });
    })
}

const bold = (text: string) => {
    return `**${text}**`;
}

const italicize = (text: string) => {
    return `*${text}*`;
}

const codeLine = (text: string) => {
    return `\`${text}\``
}

const touch = (filePath: string) => {
    try {
        let currentTime = new Date();
        fs.utimesSync(filePath, currentTime, currentTime);
    } catch (err) {
        fs.closeSync(fs.openSync(filePath, 'w'));
    }
}

const arraysEqual = (arr1: Array<any>, arr2: Array<any>) => {
    if (arr1.length !== arr2.length) {
        return false;
    }

    var arr1 = arr1.concat().sort();
    var arr2 = arr2.concat().sort();

    for (var i = 0; i < arr1.length; i++) {
        if (arr1[i] !== arr2[i]) {
            return false;
        }
    }
    return true;
}

const playSong = async (gameSession: GameSession, guildPreference: GuildPreference, db: Pool, message: Discord.Message, client: Discord.Client) => {
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

    const ytdlOptions: any = {
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
    } else {
        touch(cachedSongLocation);
    }
    if (!gameSession.connection || client.voice.connections.get(message.guild.id) == null) {
        try {
            let connection = await voiceChannel.join();
            gameSession.connection = connection;
        }
        catch (err) {
            logger.error(`${getDebugContext(message)} | Error joining voice connection. cached = ${gameSession.isSongCached}. song = ${gameSession.getDebugSongDetails()} err = ${err}`);
            sendErrorMessage(message, "Missing voice permissions", "The bot is unable to join the voice channel you are in.");
            gameSession.endRound();
            return;
        }
    }
    // We are unable to pipe the above ytdl stream into Discord.js's play
    // because it terminates the download when the dispatcher is destroyed
    // (i.e when a song is skipped)
    gameSession.dispatcher = gameSession.connection.play(
        gameSession.isSongCached ? cachedSongLocation : ytdl(gameSession.getVideoID(), ytdlOptions),
        gameSession.isSongCached ? cacheStreamOptions : streamOptions);
    logger.info(`${getDebugContext(message)} | Playing song in voice connection. cached = ${gameSession.isSongCached}. song = ${gameSession.getDebugSongDetails()}`);

    gameSession.dispatcher.on('finish', () => {
        sendSongMessage(message, gameSession, true);
        gameSession.endRound();
        logger.info(`${getDebugContext(message)} | Song finished without being guessed. song = ${gameSession.getDebugSongDetails()}`);
        startGame(gameSession, guildPreference, db, message, client);
    });

    gameSession.dispatcher.on("error", () => {
        logger.error(`${getDebugContext(message)} | Unknown error with stream dispatcher. song = ${gameSession.getDebugSongDetails()}`);
        // Attempt to restart game with different song
        sendSongMessage(message, gameSession, true);
        gameSession.endRound();
        setTimeout(() => {
            startGame(gameSession, guildPreference, db, message, client);
        }, 2000);
    })
}


export function scoreBoard(message: Discord.Message, gameSession: GameSession) {
    message.channel.send({
        embed: {
            color: EMBED_INFO_COLOR,
            title: "**Results**",
            fields: gameSession.scoreboard.getScoreboard()
        }
    })
};

export function disconnectVoiceConnection(client: Discord.Client, message: Discord.Message) {
    let voiceConnection = client.voice.connections.get(message.guild.id);
    if (voiceConnection) {
        logger.info(`${getDebugContext(message)} | Disconnected from voice channel`);
        voiceConnection.disconnect();
        return;
    }
}

export function getUserIdentifier(user: Discord.User) {
    return `${user.username}#${user.discriminator}`
}

export function cleanSongName(name: string) {
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
}

export function areUserAndBotInSameVoiceChannel(message: Discord.Message) {
    if (!message.member.voice || !message.guild.voice) {
        return false;
    }
    return message.member.voice.channel === message.guild.voice.channel;
}

export function getNumParticipants(message: Discord.Message) {
    // Don't include the bot as a participant
    return message.member.voice.channel.members.size - 1;
}

export function clearPartiallyCachedSongs() {
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
export {
    EMBED_INFO_COLOR,
    EMBED_ERROR_COLOR,
    GameOptions,
    startGame,
    getCommandFiles,
    sendSongMessage,
    getDebugContext,
    sendInfoMessage,
    sendErrorMessage,
    sendOptionsMessage,
    getSongCount,
    arraysEqual
}