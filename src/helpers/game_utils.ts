import Eris from "eris";
import fs from "fs";
import path from "path";
import dbContext from "../database_context";
import _logger from "../logger";
import GameSession from "../models/game_session";
import GuildPreference from "../models/guild_preference";
import { QueriedSong } from "../types";
import { getForcePlaySong, isDebugMode, isForcedSongActive } from "./debug_utils";
import { getDebugContext } from "./discord_utils";

const GAME_SESSION_INACTIVE_THRESHOLD = 30;

const logger = _logger("game_utils");

export async function playCorrectGuessSong(gameSession: GameSession) {
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
    });
}

async function getFilteredSongList(guildPreference: GuildPreference): Promise<{ songs: QueriedSong[], countBeforeLimit: number }> {
    let result: Array<QueriedSong>;
    if (guildPreference.getGroupIds() === null) {
        result = await dbContext.kpopVideos("available_songs")
            .select(["song_name as name", "artist_name as artist", "link as youtubeLink"])
            .whereIn("members", guildPreference.getSQLGender().split(","))
            .andWhere("publishedon", ">=", `${guildPreference.getBeginningCutoffYear()}-01-01`)
            .andWhere("publishedon", "<=", `${guildPreference.getEndCutoffYear()}-12-31`)
            .orderBy("views", "DESC");
    } else {
        result = await dbContext.kpopVideos("available_songs")
            .select(["song_name as name", "artist_name as artist", "link as youtubeLink"])
            .whereIn("id_artist", guildPreference.getGroupIds())
            .andWhere("publishedon", ">=", `${guildPreference.getBeginningCutoffYear()}-01-01`)
            .andWhere("publishedon", "<=", `${guildPreference.getEndCutoffYear()}-12-31`)
            .orderBy("views", "DESC");
    }
    return {
        songs: result.slice(0, guildPreference.getLimit()),
        countBeforeLimit: result.length,
    };
}
export async function startGame(gameSessions: { [guildID: string]: GameSession }, guildPreference: GuildPreference, message: Eris.Message<Eris.GuildTextableChannel>) {
    logger.info(`${getDebugContext(message)} | Game session starting`);
    const gameSession = gameSessions[message.guildID];
    gameSession.startRound(guildPreference, message);
}

export async function ensureVoiceConnection(gameSession: GameSession, client: Eris.Client) {
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
        } catch (e) {
            reject(e);
        }
    });
}

export async function selectRandomSong(guildPreference: GuildPreference, lastPlayedSongs: Array<string>): Promise<QueriedSong> {
    if (isDebugMode() && isForcedSongActive()) {
        const forcePlayedQueriedSong = await getForcePlaySong();
        logger.debug(`Force playing ${forcePlayedQueriedSong.name} by ${forcePlayedQueriedSong.artist} | ${forcePlayedQueriedSong.youtubeLink}`);
        return forcePlayedQueriedSong;
    }
    let { songs: queriedSongList } = await getFilteredSongList(guildPreference);
    if (lastPlayedSongs.length > 0) {
        queriedSongList = queriedSongList.filter((song: QueriedSong) => !lastPlayedSongs.includes(song.youtubeLink));
    }
    if (queriedSongList.length === 0) {
        return null;
    }

    return queriedSongList[Math.floor(Math.random() * queriedSongList.length)];
}

export async function getSongCount(guildPreference: GuildPreference): Promise<number> {
    try {
        const { countBeforeLimit: totalCount } = await getFilteredSongList(guildPreference);
        return totalCount;
    } catch (e) {
        logger.error(`Error retrieving song count ${e}`);
        return -1;
    }
}

export async function cleanupInactiveGameSessions(gameSessions: { [guildId: string]: GameSession }): Promise<void> {
    const currentDate = Date.now();
    let inactiveSessions = 0;
    const totalSessions = Object.keys(gameSessions).length;
    for (const guildId of Object.keys(gameSessions)) {
        const gameSession = gameSessions[guildId];
        const timeDiffMs = currentDate - gameSession.lastActive;
        const timeDiffMin = (timeDiffMs / (1000 * 60));
        if (timeDiffMin > GAME_SESSION_INACTIVE_THRESHOLD) {
            inactiveSessions++;
            await gameSessions[guildId].endSession();
        }
    }
    if (inactiveSessions > 0) {
        logger.info(`Ended ${inactiveSessions} inactive game sessions out of ${totalSessions}`);
    }
}

export async function getGuildPreference(guildID: string): Promise<GuildPreference> {
    const guildPreferences = await dbContext.kmq("guild_preferences").select("*").where("guild_id", guildID);
    if (guildPreferences.length === 0) {
        const guildPreference = new GuildPreference(guildID);
        await dbContext.kmq("guild_preferences")
            .insert({ guild_id: guildID, guild_preference: JSON.stringify(guildPreference), join_date: new Date() });
        return guildPreference;
    }
    return new GuildPreference(guildPreferences[0].guild_id, JSON.parse(guildPreferences[0].guild_preference));
}
