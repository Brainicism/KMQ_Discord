import { CommandArgs } from "commands/base_command";
import { songCacheDir as SONG_CACHE_DIR } from "../../config/app_config.json";
import { getUserIdentifier, sendSongMessage, getDebugContext, sendErrorMessage, touch } from "./discord_utils";
import _logger from "../logger";
import { resolve } from "path"
import * as fs from "fs";
import GameSession from "models/game_session";
import GuildPreference from "models/guild_preference";
import { Pool } from "promise-mysql";
import * as Discord from "discord.js";
import ytdl = require("ytdl-core");
import * as hangulRomanization from "hangul-romanization";
const GameOptions: { [option: string]: string } = { "GENDER": "Gender", "CUTOFF": "Cutoff", "LIMIT": "Limit", "VOLUME": "Volume" };

const logger = _logger("game_utils");

const guessSong = async ({ client, message, gameSessions, guildPreference, db }: CommandArgs) => {
    if (!client.voice.connections.get(message.guild.id).channel.members.has(message.author.id)) {
        return;
    }
    let guess = cleanSongName(message.content);
    let gameSession = gameSessions[message.guild.id];
    if (gameSession.getSong() && guess === cleanSongName(gameSession.getSong())) {
        // this should be atomic
        let userTag = getUserIdentifier(message.author);
        gameSession.scoreboard.updateScoreboard(userTag, message.author.id);
        await sendSongMessage(message, gameSession, false);
        logger.info(`${getDebugContext(message)} | Song correctly guessed. song = ${gameSession.getSong()}`)
        gameSession.endRound();
        if (gameSession.connection) {
            gameSession.connection.play(resolve("assets/ring.wav"));
        }
        setTimeout(() => {
            startGame(gameSession, guildPreference, db, message, client);
        }, 2000);
    }
}


const startGame = async (gameSession: GameSession, guildPreference: GuildPreference, db: Pool, message: Discord.Message, client: Discord.Client) => {
    if (!gameSession || gameSession.finished) {
        return;
    }
    if (gameSession.gameInSession()) {
        await sendErrorMessage(message, `Game already in session`, null);
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
        await sendErrorMessage(message, "KMQ database query error", err.toString());
        logger.error(`${getDebugContext(message)} | Error querying song: ${err}`);
    }
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

    const ytdlOptions = {
        filter: "audioonly" as const,
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
            cacheStream.on("finish", () => {
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
            await sendErrorMessage(message, "Missing voice permissions", "The bot is unable to join the voice channel you are in.");
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

    gameSession.dispatcher.on("finish", async () => {
        await sendSongMessage(message, gameSession, true);
        gameSession.endRound();
        logger.info(`${getDebugContext(message)} | Song finished without being guessed. song = ${gameSession.getDebugSongDetails()}`);
        startGame(gameSession, guildPreference, db, message, client);
    });

    gameSession.dispatcher.on("error", async () => {
        logger.error(`${getDebugContext(message)} | Unknown error with stream dispatcher. song = ${gameSession.getDebugSongDetails()}`);
        // Attempt to restart game with different song
        await sendSongMessage(message, gameSession, true);
        gameSession.endRound();
        setTimeout(() => {
            startGame(gameSession, guildPreference, db, message, client);
        }, 2000);
    })
}

const cleanSongName = (name: string): string => {
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

const getSongCount = async (guildPreference: GuildPreference, db: Pool): Promise<number> => {
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

export {
    guessSong,
    startGame,
    getSongCount,
    GameOptions
}
