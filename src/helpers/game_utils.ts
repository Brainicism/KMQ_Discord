import Eris from "eris";
import fs from "fs";
import path from "path";
import { db } from "../databases";
import _logger from "../logger";
import GameSession from "../models/game_session";
import GuildPreference from "../models/guild_preference";
import { QueriedSong } from "../types";
import { getForcePlaySong, isDebugMode, isForcedSongActive } from "./debug_utils";
import { getDebugContext } from "./discord_utils";
const GAME_SESSION_INACTIVE_THRESHOLD = 30;

export enum GameOption {
    GENDER = "Gender",
    CUTOFF = "Cutoff",
    LIMIT = "Limit",
    VOLUME = "Volume",
    SEEK_TYPE = "Seek Type",
    MODE_TYPE = "Guess Mode",
    GROUPS = "Groups",
    GOAL = "Goal"
}
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
        }
        catch (e) {
            reject(e);
        }
    })

}

export async function selectRandomSong(guildPreference: GuildPreference): Promise<QueriedSong> {
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
            await gameSessions[guildId].endSession();
        }
    }
    if (inactiveSessions > 0) {
        logger.info(`Ended ${inactiveSessions} inactive game sessions out of ${totalSessions}`);
    }
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
