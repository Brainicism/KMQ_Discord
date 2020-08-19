import { CommandArgs } from "../commands/base_command";
import { songCacheDir as SONG_CACHE_DIR } from "../config/app_config.json";
import { getUserIdentifier, sendSongMessage, getDebugContext, sendErrorMessage, getVoiceChannel, sendEndGameMessage } from "./discord_utils";
import * as Eris from "eris";
import _logger from "../logger";
import * as fs from "fs";
import * as path from "path";
import GameSession from "../models/game_session";
import GuildPreference from "../models/guild_preference";
import { getAudioDurationInSeconds } from "get-audio-duration";
import { QueriedSong } from "../types";
import { SEEK_TYPE } from "../commands/seek";
import { isDebugMode, getForcePlaySong, skipSongPlay, isForcedSongActive } from "./debug_utils";
import { db } from "../databases";
import { client } from "../kmq";
const GAME_SESSION_INACTIVE_THRESHOLD = 30;
const REMOVED_CHARACTERS_SONG_GUESS = /[\|’\ ']/g
const REMOVED_CHARACTERS_ARTIST_GUESS = /[:'.\-★*]/g
export enum GameOption {
    GENDER = "Gender",
    CUTOFF = "Cutoff",
    LIMIT = "Limit",
    VOLUME = "Volume",
    SEEK_TYPE = "Seek Type",
    MODE_TYPE = "Guess Mode",
    GROUPS = "Groups"
}
const logger = _logger("game_utils");


export async function guessSong({ message, gameSessions }: CommandArgs) {
    const guildPreference = await getGuildPreference(message.guildID);
    const gameSession = gameSessions[message.guildID];
    const voiceChannel = getVoiceChannel(message);
    if (!gameSession || !gameSession.gameRound || gameSession.gameRound.finished) return;

    //if user isn't in the same voice channel
    if (!voiceChannel || !voiceChannel.voiceMembers.has(message.author.id)) {
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
        await sendSongMessage(message, gameSession, false, userTag);
        await playCorrectGuessSong(gameSession);
        await db.kmq("guild_preferences")
            .where("guild_id", message.guildID)
            .increment("songs_guessed", 1);
        startRound(gameSessions, guildPreference, message);
    }
}

async function playCorrectGuessSong(gameSession: GameSession) {
    return new Promise((resolve) => {
        if (gameSession.connection) {
            const stream = fs.createReadStream(path.resolve("assets/ring.wav"));
            gameSession.connection.play(stream);
            gameSession.connection.once("end", () => {
                resolve();
            });
            gameSession.connection.once("error", () => {
                resolve();
            });
        }
        resolve();
    })

}

async function getFilteredSongList(guildPreference: GuildPreference): Promise<{ songs: QueriedSong[], countBeforeLimit: number }> {
    let result: Array<QueriedSong>;
    if (guildPreference.getGroupIds() === null) {
        result = await db.kpopVideos("kpop_videos.app_kpop")
            .select(["nome as name", "name as artist", "vlink as youtubeLink"])
            .join("kpop_videos.app_kpop_group", function () {
                this.on("kpop_videos.app_kpop.id_artist", "=", "kpop_videos.app_kpop_group.id")
            })
            .whereNotIn("vlink", function () {
                this.select("vlink").from("kmq.not_downloaded")
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
            .whereNotIn("vlink", function () {
                this.select("vlink").from("kmq.not_downloaded")
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
export async function startGame(gameSessions: { [guildID: string]: GameSession }, guildPreference: GuildPreference, message: Eris.Message<Eris.GuildTextableChannel>) {
    logger.info(`${getDebugContext(message)} | Game session starting`);
    startRound(gameSessions, guildPreference, message);
}

async function startRound(gameSessions: { [guildID: string]: GameSession }, guildPreference: GuildPreference, message: Eris.Message<Eris.GuildTextableChannel>) {
    const gameSession = gameSessions[message.guildID];
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
        randomSong = await selectRandomSong(guildPreference);
        if (randomSong === null) {
            gameSession.setSessionInitialized(false);
            sendErrorMessage(message, "Song Query Error", "Failed to find songs matching this criteria. Try to broaden your search.");
            return;
        }
    }
    catch (err) {
        gameSession.setSessionInitialized(false);
        await sendErrorMessage(message, "Error selecting song", err.toString());
        logger.error(`${getDebugContext(message)} | Error querying song: ${err.toString()}. guildPreference = ${JSON.stringify(guildPreference)}`);
        return;
    }
    gameSession.startRound(randomSong.name, randomSong.artist, randomSong.youtubeLink);
    try {
        await ensureVoiceConnection(gameSession, client);
    }
    catch (err) {
        await gameSession.endSession(gameSessions);
        gameSession.setSessionInitialized(false);
        logger.error(`${getDebugContext(message)} | Error obtaining voice connection. err = ${err.toString()}`);
        await sendErrorMessage(message, "Missing voice permissions", "The bot is unable to join the voice channel you are in.");
        return;
    }
    playSong(gameSessions, guildPreference, message, client);
}

async function ensureVoiceConnection(gameSession: GameSession, client: Eris.Client) {
    return new Promise(async (resolve, reject) => {
        try {
            const connection = await client.joinVoiceChannel(gameSession.voiceChannel.id);
            gameSession.connection = connection;
            if (gameSession.connection.ready) {
                resolve();
            }
            connection.once("ready", () => {
                resolve();
            });
        }
        catch (e) {
            reject(e);
        }
    })

}

async function selectRandomSong(guildPreference: GuildPreference): Promise<QueriedSong> {
    if (isDebugMode() && isForcedSongActive()) {
        const forcePlayedQueriedSong = await getForcePlaySong();
        logger.debug(`Force playing ${forcePlayedQueriedSong.name} by ${forcePlayedQueriedSong.artist} | ${forcePlayedQueriedSong.youtubeLink}`);
        return forcePlayedQueriedSong;
    }
    const { songs: queriedSongList } = await getFilteredSongList(guildPreference);
    if (queriedSongList.length === 0) {
        return null;
    }

    return queriedSongList[Math.floor(Math.random() * queriedSongList.length)];
}

async function playSong(gameSessions: { [guildID: string]: GameSession }, guildPreference: GuildPreference, message: Eris.Message<Eris.GuildTextableChannel>, client: Eris.Client) {
    const gameSession = gameSessions[message.guildID];
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



    const stream = fs.createReadStream(songLocation);
    await delay(2000);
    //check if ,end was called during the delay
    if (gameSession.finished || gameSession.gameRound.finished) {
        logger.debug(`${getDebugContext(message)} | startGame called with ${gameSession.finished}, ${gameRound.finished}`);
        return;
    }



    logger.info(`${getDebugContext(message)} | Playing song in voice connection. seek = ${guildPreference.getSeekType()}. song = ${gameSession.getDebugSongDetails()}. mode = ${guildPreference.getModeType()}`);
    gameSession.connection.stopPlaying();
    gameSession.connection.play(stream, {
        inputArgs: ["-ss", seekLocation.toString()],
        encoderArgs: ["-filter:a", `volume=0.1`]
    });
    gameSession.connection.once("end", async () => {
        logger.info(`${getDebugContext(message)} | Song finished without being guessed.`);
        await sendSongMessage(message, gameSession, true);
        gameSession.endRound(false);
        startRound(gameSessions, guildPreference, message);
    })

    gameSession.connection.once("error", async (err) => {
        if (!gameSession.connection.channelID) {
            logger.info(`gid: ${gameSession.textChannel.guild.id} | Bot was kicked from voice channel`);
            await sendEndGameMessage({ channel: message.channel }, gameSession);
            await gameSession.endSession(gameSessions);
            return;
        }

        logger.error(`${getDebugContext(message)} | Unknown error with stream dispatcher. song = ${gameSession.getDebugSongDetails()}. err = ${err}`);
        // Attempt to restart game with different song
        await sendErrorMessage(message, "Error playing song", "Starting new round in 2 seconds...");
        gameSession.endRound(false);
        startRound(gameSessions, guildPreference, message);
    });



}

export function cleanSongName(name: string): string {
    const cleanName = name.toLowerCase()
        .split("(")[0]
        .replace(REMOVED_CHARACTERS_SONG_GUESS, "")
        .trim();
    return cleanName;
}

export function cleanArtistName(name: string): string {
    const cleanName = name.toLowerCase()
        .replace(REMOVED_CHARACTERS_ARTIST_GUESS, "")
        .trim();
    return cleanName;
}

export async function getSongCount(guildPreference: GuildPreference): Promise<number> {
    try {
        const { countBeforeLimit: totalCount } = await getFilteredSongList(guildPreference);
        return totalCount;
    }
    catch (e) {
        logger.error(`Error retrieving song count ${e}`);
        return -1;
    }
}

export async function cleanupInactiveGameSessions(gameSessions: { [guildId: string]: GameSession }): Promise<void> {
    const currentDate = Date.now();
    let inactiveSessions = 0;
    const totalSessions = Object.keys(gameSessions).length;
    for (let guildId in gameSessions) {
        const gameSession = gameSessions[guildId];
        const timeDiffMs = currentDate - gameSession.lastActive;
        const timeDiffMin = (timeDiffMs / (1000 * 60));
        if (timeDiffMin > GAME_SESSION_INACTIVE_THRESHOLD) {
            inactiveSessions++;
            await gameSessions[guildId].endSession(gameSessions);
        }
    }
    if (inactiveSessions > 0) {
        logger.info(`Ended ${inactiveSessions} inactive game sessions out of ${totalSessions}`);
    }
}

function delay(delayDuration: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, delayDuration));
}

export async function getGuildPreference(guildID: string): Promise<GuildPreference> {
    const guildPreferences = await db.kmq("guild_preferences").select("*").where("guild_id", guildID);
    if (guildPreferences.length === 0) {
        const guildPreference = new GuildPreference(guildID);
        logger.info(`New server joined: ${guildID}`);
        await db.kmq("guild_preferences")
            .insert({ guild_id: guildID, guild_preference: JSON.stringify(guildPreference), join_date: new Date() });
        return guildPreference;
    }
    return new GuildPreference(guildPreferences[0].guild_id, JSON.parse(guildPreferences[0].guild_preference));
}
