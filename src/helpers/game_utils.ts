import { CommandArgs } from "commands/base_command";
import { songCacheDir as SONG_CACHE_DIR } from "../../config/app_config.json";
import { getUserIdentifier, sendSongMessage, getDebugContext, sendErrorMessage } from "./discord_utils";
import _logger from "../logger";
import { resolve } from "path"
import * as fs from "fs";
import GameSession from "../models/game_session";
import GuildPreference from "../models/guild_preference";
import { getAudioDurationInSeconds } from "get-audio-duration";
import * as Discord from "discord.js";
import { QueriedSong, Databases } from "types";
import { SEEK_TYPE } from "../commands/seek";
import { isDebugMode, getForcePlaySong, skipSongPlay, isForcedSongActive } from "./debug_utils";
const GAME_SESSION_INACTIVE_THRESHOLD = 30;
const REMOVED_CHARACTERS_SONG_GUESS = /[\|’\ ']/g
const REMOVED_CHARACTERS_ARTIST_GUESS = /[:'.\-★*]/g
enum GameOption {
    GENDER = "Gender",
    CUTOFF = "Cutoff",
    LIMIT = "Limit",
    VOLUME = "Volume",
    SEEK_TYPE = "Seek Type",
    MODE_TYPE = "Guess Mode",
    GROUPS = "Groups"
}
const logger = _logger("game_utils");


const guessSong = async ({ client, message, gameSessions, db }: CommandArgs) => {
    const guildPreference = await getGuildPreference(db, message.guild.id);
    const gameSession = gameSessions[message.guild.id];
    const voiceConnection = client.voiceConnections.get(message.guild.id);
    if (!gameSession || !gameSession.gameRound || gameSession.gameRound.finished) return;

    //if user isn't in the same voice channel
    if (!voiceConnection || !voiceConnection.channel.members.has(message.author.id)) {
        return;
    }

    //if message isn't in the active game session's text channel
    if (message.channel.id !== gameSession.textChannel.id) {
        return;
    }

    if (gameSession.checkGuess(message, guildPreference.getModeType())) {
        logger.info(`${getDebugContext(message)} | Song correctly guessed. song = ${gameSession.gameRound.song}`)
        const userTag = getUserIdentifier(message.author);
        gameSession.scoreboard.updateScoreboard(userTag, message.author.id);
        gameSession.endRound(true);
        await sendSongMessage(message, gameSession, false);

        await db.kmq("guild_preferences")
            .where("guild_id", message.guild.id)
            .increment("songs_guessed", 1);

        if (gameSession.connection) {
            const stream: string = resolve("assets/ring.wav");
            gameSession.connection.playFile(stream);
        }
        startRound(gameSessions, guildPreference, db, message, client);
    }
}

const getFilteredSongList = async (guildPreference: GuildPreference, db: Databases): Promise<{ songs: QueriedSong[], countBeforeLimit: number }> => {
    let result: Array<QueriedSong>;
    if (guildPreference.getGroupIds() === null) {
        result = await db.kpopVideos("kpop_videos.app_kpop")
            .select(["nome as name", "name as artist", "vlink as youtubeLink"])
            .join("kpop_videos.app_kpop_group", function () {
                this.on("kpop_videos.app_kpop.id_artist", "=", "kpop_videos.app_kpop_group.id")
            })
            .whereIn("members", guildPreference.getSQLGender().split(","))
            .andWhere("dead", "n")
            .andWhere("publishedon", ">=", `${guildPreference.getBeginningCutoffYear()}-01-01`)
            .andWhere("publishedon", "<=", `${guildPreference.getEndCutoffYear()}-12-31`)
            .andWhere("vtype", "main")
            .orderBy("kpop_videos.app_kpop.views", "DESC")
    }
    else {
        result = await db.kpopVideos("kpop_videos.app_kpop")
            .select(["nome as name", "name as artist", "vlink as youtubeLink"])
            .join("kpop_videos.app_kpop_group", function () {
                this.on("kpop_videos.app_kpop.id_artist", "=", "kpop_videos.app_kpop_group.id")
            })
            .whereIn("id_artist", guildPreference.getGroupIds())
            .andWhere("dead", "n")
            .andWhere("publishedon", ">=", `${guildPreference.getBeginningCutoffYear()}-01-01`)
            .andWhere("publishedon", "<=", `${guildPreference.getEndCutoffYear()}-12-31`)
            .andWhere("vtype", "main")
            .orderBy("kpop_videos.app_kpop.views", "DESC")
    }

    return {
        songs: result.slice(0, guildPreference.getLimit()),
        countBeforeLimit: result.length
    };

}
const startGame = async (gameSessions: { [guildID: string]: GameSession }, guildPreference: GuildPreference, db: Databases, message: Discord.Message, client: Discord.Client) => {
    logger.info(`${getDebugContext(message)} | Game session starting`);
    startRound(gameSessions, guildPreference, db, message, client);
}

const startRound = async (gameSessions: { [guildID: string]: GameSession }, guildPreference: GuildPreference, db: Databases, message: Discord.Message, client: Discord.Client) => {
    const gameSession = gameSessions[message.guild.id];
    if (!gameSession || gameSession.finished) {
        return;
    }

    if (gameSession.sessionIsInitialized()) {
        await sendErrorMessage(message, `Game already in session`, null);
        return;
    }
    gameSession.setSessionInitialized(true);
    let randomSong: QueriedSong;
    try {
        randomSong = await selectRandomSong(guildPreference, db);
        if (randomSong === null) {
            gameSession.setSessionInitialized(false);
            sendErrorMessage(message, "Song Query Error", "Failed to find songs matching this criteria. Try to broaden your search.");
            return;
        }
    }
    catch (err) {
        gameSession.setSessionInitialized(false);
        await sendErrorMessage(message, "Error selecting song", err.toString());
        logger.error(`${getDebugContext(message)} | Error querying song: ${err}. guildPreference = ${JSON.stringify(guildPreference)}`);
        return;
    }

    try {
        await ensureVoiceConnection(gameSession, client);
    }
    catch (err) {
        gameSession.setSessionInitialized(false);
        logger.error(`${getDebugContext(message)} | Error obtaining voice connection. err = ${err}`);
        await sendErrorMessage(message, "Missing voice permissions", "The bot is unable to join the voice channel you are in.");
        return;
    }
    gameSession.startRound(randomSong.name, randomSong.artist, randomSong.youtubeLink);
    playSong(gameSessions, guildPreference, db, message, client);
}

const ensureVoiceConnection = async (gameSession: GameSession, client: Discord.Client) => {
    let existingVoiceConnection = client.voiceConnections.get(gameSession.textChannel.guild.id);
    if (existingVoiceConnection) {
        // temporary fix for monotonously increasing delay in vc.play() in discord.js v11
        if (gameSession.roundsPlayed > 0 && gameSession.roundsPlayed % 15 == 0) {
            gameSession.connection.disconnect();
            await delay(500);
        }
        else {
            return;
        }
    }
    const connection = await gameSession.voiceChannel.join();
    gameSession.connection = connection;
}

const selectRandomSong = async (guildPreference: GuildPreference, db: Databases): Promise<QueriedSong> => {
    if (isDebugMode() && isForcedSongActive()) {
        const forcePlayedQueriedSong = await getForcePlaySong(db);
        logger.debug(`Force playing ${forcePlayedQueriedSong.name} by ${forcePlayedQueriedSong.artist} | ${forcePlayedQueriedSong.youtubeLink}`);
        return forcePlayedQueriedSong;
    }
    const { songs: queriedSongList } = await getFilteredSongList(guildPreference, db);
    if (queriedSongList.length === 0) {
        return null;
    }

    let attempts = 0;
    while (true) {
        // this case should rarely happen assuming our song cache is relatively up to date
        if (attempts > 5) {
            logger.error(`Failed to select a random song: guildPref = ${JSON.stringify(guildPreference)}`);
            return null;
        }
        const random = queriedSongList[Math.floor(Math.random() * queriedSongList.length)];

        if (isDebugMode() && skipSongPlay()) {
            return random;
        }
        const songLocation = `${SONG_CACHE_DIR}/${random.youtubeLink}.mp3`;
        if (!fs.existsSync(songLocation)) {
            logger.error(`Song not cached: ${songLocation}`);
            attempts++;
            continue;
        }
        return random;
    }
}

const playSong = async (gameSessions:  { [guildID: string]: GameSession }, guildPreference: GuildPreference, db: Databases, message: Discord.Message, client: Discord.Client) => {
    const gameSession = gameSessions[message.guild.id];
    if (!gameSession) return;
    const gameRound = gameSession.gameRound;

    if (isDebugMode() && skipSongPlay()) {
        logger.debug(`${getDebugContext(message)} | Not playing song in voice connection. song = ${gameSession.getDebugSongDetails()}`);
        return;
    }
    const songLocation = `${SONG_CACHE_DIR}/${gameRound.videoID}.mp3`;

    let seekLocation: number;
    if (guildPreference.getSeekType() === SEEK_TYPE.RANDOM) {
        try {
            const songDuration = await getAudioDurationInSeconds(songLocation);
            seekLocation = songDuration * (0.6 * Math.random());
        }
        catch (e) {
            logger.error(`Failed to get mp3 length: ${songLocation}. err = ${e}`);
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
    const stream = fs.createReadStream(songLocation);
    await delay(2000);
    //check if ,end was called during the delay
    if (gameSession.finished || gameSession.gameRound.finished) {
        logger.debug(`${getDebugContext(message)} | startGame called with ${gameSession.finished}, ${gameRound.finished}`);
        return;
    }
    gameSession.dispatcher = gameSession.connection.playStream(stream, streamOptions);
    logger.info(`${getDebugContext(message)} | Playing song in voice connection. seek = ${guildPreference.getSeekType()}. song = ${gameSession.getDebugSongDetails()}. mode = ${guildPreference.getModeType()}`);

    gameSession.dispatcher.once("end", async () => {
        logger.info(`${getDebugContext(message)} | Song finished without being guessed.`);
        await sendSongMessage(message, gameSession, true);
        gameSession.endRound(false);
        startRound(gameSessions, guildPreference, db, message, client);
    });

    gameSession.dispatcher.once("error", async (err) => {
        if (!client.voiceConnections.get(gameSession.textChannel.guild.id)) {
            logger.info(`gid: ${gameSession.textChannel.guild.id} | Bot was kicked from voice channel`);
            await gameSession.endSession(gameSessions, db);
            return;
        }

        logger.error(`${getDebugContext(message)} | Unknown error with stream dispatcher. song = ${gameSession.getDebugSongDetails()}. err = ${err}`);
        // Attempt to restart game with different song
        await sendErrorMessage(message, "Error playing song", "Starting new round in 2 seconds...");
        gameSession.endRound(false);
        startRound(gameSessions, guildPreference, db, message, client);
    })
}

const cleanSongName = (name: string): string => {
    const cleanName = name.toLowerCase()
        .split("(")[0]
        .replace(REMOVED_CHARACTERS_SONG_GUESS, "")
        .trim();
    return cleanName;
}

const cleanArtistName = (name: string): string => {
    const cleanName = name.toLowerCase()
        .replace(REMOVED_CHARACTERS_ARTIST_GUESS, "")
        .trim();
    return cleanName;
}

const getSongCount = async (guildPreference: GuildPreference, db: Databases): Promise<number> => {
    try {
        const { countBeforeLimit: totalCount } = await getFilteredSongList(guildPreference, db);
        return totalCount;
    }
    catch (e) {
        logger.error(`Error retrieving song count ${e}`);
        return -1;
    }
}

const cleanupInactiveGameSessions = async (gameSessions: { [guildId: string]: GameSession }, db): Promise<void> => {
    const currentDate = Date.now();
    let inactiveSessions = 0;
    const totalSessions = Object.keys(gameSessions).length;
    for (let guildId in gameSessions) {
        const gameSession = gameSessions[guildId];
        const timeDiffMs = currentDate - gameSession.lastActive;
        const timeDiffMin = (timeDiffMs / (1000 * 60));
        if (timeDiffMin > GAME_SESSION_INACTIVE_THRESHOLD) {
            inactiveSessions++;
            await gameSessions[guildId].endSession(gameSessions, db);
        }
    }
    if (inactiveSessions > 0) {
        logger.info(`Ended ${inactiveSessions} inactive game sessions out of ${totalSessions}`);
    }
}

const delay = (delayDuration: number): Promise<void> => {
    return new Promise(resolve => setTimeout(resolve, delayDuration));
}

const getGuildPreference = async (db: Databases, guildID: string): Promise<GuildPreference> => {
    const guildPreferences = await db.kmq("guild_preferences").select("*").where("guild_id", guildID);
    if (guildPreferences.length === 0) {
        const guildPreference = new GuildPreference(guildID);
        logger.info(`New server joined: ${guildID}`);
        await db.kmq("guild_preferences")
            .insert({ guild_id: guildID, guild_preference: JSON.stringify(guildPreference), join_date: new Date() });
        return guildPreference;
    }
    return new GuildPreference(guildPreferences[0].guild_id, JSON.parse(guildPreferences[0].guild_preference), db);
}


export {
    guessSong,
    startGame,
    cleanSongName,
    cleanArtistName,
    getSongCount,
    GameOption,
    cleanupInactiveGameSessions,
    getGuildPreference
}
