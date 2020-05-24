import { CommandArgs } from "commands/base_command";
import { songCacheDir as SONG_CACHE_DIR } from "../../config/app_config.json";
import { getUserIdentifier, sendSongMessage, getDebugContext, sendErrorMessage, touch } from "./discord_utils";
import _logger from "../logger";
import { resolve } from "path"
import * as fs from "fs";
import GameSession from "models/game_session";
import GuildPreference from "models/guild_preference";
import { getAudioDurationInSeconds } from "get-audio-duration";
import { Pool } from "promise-mysql";
import * as Discord from "discord.js";
import * as hangulRomanization from "hangul-romanization";
import { QueriedSong } from "types";
import { SEEK_TYPES } from "../commands/seek";
const GameOptions: { [option: string]: string } = { "GENDER": "Gender", "CUTOFF": "Cutoff", "LIMIT": "Limit", "VOLUME": "Volume", "SEEK_TYPE": "Seek Type" };

const logger = _logger("game_utils");


const guessSong = async ({ client, message, gameSessions, guildPreference, db }: CommandArgs) => {
    const voiceConnection = client.voice.connections.get(message.guild.id);
    if (!voiceConnection || !voiceConnection.channel.members.has(message.author.id)) {
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
        await gameSession.endRound();
        if (gameSession.connection) {
            gameSession.connection.play(resolve("assets/ring.wav"));
        }
        setTimeout(() => {
            startGame(gameSession, guildPreference, db, message, client, null);
        }, 2000);
    }
}


const startGame = async (gameSession: GameSession, guildPreference: GuildPreference, db: Pool, message: Discord.Message, client: Discord.Client, voiceChannel?: Discord.VoiceChannel) => {
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
        let result = await db.query(query, [guildPreference.getSQLGender(), guildPreference.getBeginningCutoffYear(), guildPreference.getLimit()]);
        let randomSong = selectRandomSong(result, guildPreference);
        if (randomSong === null) {
            sendErrorMessage(message, "Song Query Error", "Failed to find songs matching this criteria. Try to broaden your search.");
            return;
        }
        gameSession.startRound(randomSong.name, randomSong.artist, randomSong.youtubeLink);
        await ensureVoiceConnection(message, gameSession, client, voiceChannel);
        playSong(gameSession, guildPreference, db, message, client);
        logger.info(`${getDebugContext(message)} | Playing song: ${gameSession.getDebugSongDetails()}`);
    }
    catch (err) {
        await sendErrorMessage(message, "KMQ database query error", err.toString());
        logger.error(`${getDebugContext(message)} | Error querying song: ${err}. guildPreference = ${JSON.stringify(guildPreference)}`);
    }
}

const ensureVoiceConnection = async (message: Discord.Message, gameSession: GameSession, client: Discord.Client, voiceChannel?: Discord.VoiceChannel) => {
    if (voiceChannel) {
        try {
            let connection = await voiceChannel.join();
            gameSession.connection = connection;
        }
        catch (err) {
            logger.error(`${getDebugContext(message)} | Error joining voice connection. song = ${gameSession.getDebugSongDetails()} err = ${err}`);
            await sendErrorMessage(message, "Missing voice permissions", "The bot is unable to join the voice channel you are in.");
            await gameSession.endRound();
            return;
        }
    }
}
const selectRandomSong = (queriedSongList: Array<QueriedSong>, guild_preference: GuildPreference): QueriedSong => {
    let attempts = 0;
    if (queriedSongList.length == 0) {
        return null;
    }
    while (true) {
        // this case should rarely happen assuming our song cache is relatively up to date
        if (attempts > 5) {
            logger.error(`Failed to select a random song: guildPref = ${JSON.stringify(guild_preference)}`);
            return null;
        }
        let random = queriedSongList[Math.floor(Math.random() * queriedSongList.length)];
        const songLocation = `${SONG_CACHE_DIR}/${random.youtubeLink}.mp3`;
        if (!fs.existsSync(songLocation)) {
            logger.error(`Song not cached: ${songLocation}`);
            attempts++;
            continue;
        }
        logger.info(`Selected song: ${random.youtubeLink}`)
        return random;
    }
}

const playSong = async (gameSession: GameSession, guildPreference: GuildPreference, db: Pool, message: Discord.Message, client: Discord.Client) => {
    const songLocation = `${SONG_CACHE_DIR}/${gameSession.getVideoID()}.mp3`;

    let seekLocation: number;
    if (guildPreference.getSeekType() === SEEK_TYPES.RANDOM) {
        try {
            const songDuration = await getAudioDurationInSeconds(songLocation);
            seekLocation = songDuration * (0.6 * Math.random());
        }
        catch (e) {
            logger.error(`Failed to get mp3 length: ${songLocation}`);
            seekLocation = 0;
        }
    }
    else {
        seekLocation = 0;
    }
    const streamOptions = {
        volume: guildPreference.getStreamVolume(),
        bitrate: gameSession.connection.channel.bitrate,
        seek: seekLocation
    };

    gameSession.dispatcher = gameSession.connection.play(songLocation, streamOptions);
    logger.info(`${getDebugContext(message)} | Playing song in voice connection. seek = ${guildPreference.getSeekType()}. song = ${gameSession.getDebugSongDetails()}`);

    gameSession.dispatcher.on("finish", async () => {
        await sendSongMessage(message, gameSession, true);
        await gameSession.endRound();
        logger.info(`${getDebugContext(message)} | Song finished without being guessed. song = ${gameSession.getDebugSongDetails()}`);
        startGame(gameSession, guildPreference, db, message, client, null);
    });

    gameSession.dispatcher.on("error", async () => {
        logger.error(`${getDebugContext(message)} | Unknown error with stream dispatcher. song = ${gameSession.getDebugSongDetails()}`);
        // Attempt to restart game with different song
        await sendErrorMessage(message, "Error playing song", "Starting new round in 2 seconds...");
        await gameSession.endRound();
        setTimeout(() => {
            startGame(gameSession, guildPreference, db, message, client, null);
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
