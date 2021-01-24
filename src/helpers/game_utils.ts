import dbContext from "../database_context";
import state from "../kmq";
import _logger from "../logger";
import GameSession from "../structures/game_session";
import GuildPreference from "../structures/guild_preference";
import { QueriedSong } from "../types";
import { getForcePlaySong, isDebugMode, isForcedSongActive } from "./debug_utils";
import { sendEndGameMessage } from "./discord_utils";
import { GENDER } from "../commands/game_options/gender";
import { ArtistType } from "../commands/game_options/artisttype";
import { LanguageType } from "../commands/game_options/language";

const GAME_SESSION_INACTIVE_THRESHOLD = 30;

const logger = _logger("game_utils");

interface GroupMatchResults {
    unmatchedGroups?: Array<string>;
    matchedGroups?: { id: number, name: string }[];
}

/**
 * Returns a list of songs from the data store, narrowed down by the specified game options
 * @param guildPreference - The GuildPreference
 * @param ignoredVideoIds - List of Youtube video IDs of songs to ignore
 * @returns a list of songs, as well as the number of songs before the filter option was applied
 */
async function getFilteredSongList(guildPreference: GuildPreference, ignoredVideoIds?: Array<string>, alternatingGender?: GENDER): Promise<{ songs: QueriedSong[], countBeforeLimit: number }> {
    let queryBuilder = dbContext.kmq("available_songs")
        .select(["song_name as name", "artist_name as artist", "link as youtubeLink"])
        .whereNotIn("id_artist", guildPreference.getExcludesGroupIds())
        .andWhere("publishedon", ">=", `${guildPreference.getBeginningCutoffYear()}-01-01`)
        .andWhere("publishedon", "<=", `${guildPreference.getEndCutoffYear()}-12-31`);

    if (!guildPreference.isGroupsMode()) {
        const gender = guildPreference.isGenderAlternating() ? [GENDER.MALE, GENDER.FEMALE] : guildPreference.getGender();
        queryBuilder = queryBuilder.whereIn("members", gender);

        // filter by artist type only in non-groups
        if (guildPreference.getArtistType() !== ArtistType.BOTH) {
            queryBuilder.andWhere("issolo", "=", guildPreference.getArtistType() === ArtistType.SOLOIST ? "y" : "n");
        }
    } else {
        queryBuilder = queryBuilder.whereIn("id_artist", guildPreference.getGroupIds());
    }

    if (guildPreference.getLanguageType() === LanguageType.KOREAN) {
        queryBuilder = queryBuilder
            .where("song_name", "NOT LIKE", "%(cn)%")
            .where("song_name", "NOT LIKE", "%(en)%")
            .where("song_name", "NOT LIKE", "%(jp)%");
    }

    let result: Array<QueriedSong> = await queryBuilder.orderBy("views", "DESC");

    const count = result.length;
    result = result.slice(0, guildPreference.getLimit());
    if (ignoredVideoIds && ignoredVideoIds.length > 0) {
        result = result.filter((song) => !ignoredVideoIds.includes(song.youtubeLink));
    }
    if (guildPreference.isGenderAlternating() && alternatingGender) {
        const alternatingResult = await dbContext.kmq("available_songs")
            .select(["song_name as name", "artist_name as artist", "link as youtubeLink"])
            .whereIn("link", result.map((song) => song.youtubeLink))
            .andWhere("members", "=", [alternatingGender]);
        if (alternatingResult.length > 0) {
            result = alternatingResult;
        }
    }
    return {
        songs: result,
        countBeforeLimit: count,
    };
}

/**
 * Joins the VoiceChannel specified by GameSession, and stores the VoiceConnection
 * @param gameSession - The active GameSession
 */
export async function ensureVoiceConnection(gameSession: GameSession): Promise<void> {
    const { client } = state;
    return new Promise(async (resolve, reject) => {
        try {
            const connection = await client.joinVoiceChannel(gameSession.voiceChannel.id, { opusOnly: true });
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

/**
 * Selects a random song based on the GameOptions, avoiding recently played songs
 * @param guildPreference - The GuildPreference
 * @param lastPlayedSongs - The list of recently played songs
 */
export async function selectRandomSong(guildPreference: GuildPreference, lastPlayedSongs: Array<string>, alternatingGender?: GENDER): Promise<QueriedSong> {
    if (isDebugMode() && isForcedSongActive()) {
        const forcePlayedQueriedSong = await getForcePlaySong();
        logger.info(`Force playing ${forcePlayedQueriedSong.name} by ${forcePlayedQueriedSong.artist} | ${forcePlayedQueriedSong.youtubeLink}`);
        return forcePlayedQueriedSong;
    }
    let queriedSongList: Array<QueriedSong>;
    if (alternatingGender) {
        queriedSongList = (await getFilteredSongList(guildPreference, lastPlayedSongs, alternatingGender)).songs;
    } else {
        queriedSongList = (await getFilteredSongList(guildPreference, lastPlayedSongs)).songs;
    }
    if (queriedSongList.length === 0) {
        return null;
    }

    return queriedSongList[Math.floor(Math.random() * queriedSongList.length)];
}

/**
 * @param guildPreference - The GuildPreference
 * @returns the total number of available songs based on the GameOptions
 */
export async function getSongCount(guildPreference: GuildPreference): Promise<number> {
    try {
        const { countBeforeLimit: totalCount } = await getFilteredSongList(guildPreference);
        return totalCount;
    } catch (e) {
        logger.error(`Error retrieving song count ${e}`);
        return -1;
    }
}

/** Cleans up inactive GameSessions */
export async function cleanupInactiveGameSessions(): Promise<void> {
    const { gameSessions } = state;
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

/**
 * Gets or creates a GuildPreference
 * @param guildID - The Guild ID
 * @returns the correspond guild's GuildPreference
 */
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

/**
 * Perform end of GameSession cleanup activities
 * @param gameSession - The GameSession to end
 */
export async function endSession(gameSession: GameSession) {
    await sendEndGameMessage(gameSession.textChannel, gameSession);
    await gameSession.endSession();
}

/**
 * @param rawGroupNames - List of user-inputted group names
 * @returns a list of recognized/unrecognized groups
 */
export async function getMatchingGroupNames(rawGroupNames: Array<string>): Promise<GroupMatchResults> {
    const matchingGroups = (await dbContext.kpopVideos("kpop_videos.app_kpop_group")
        .select(["id", "name"])
        .whereIn("name", rawGroupNames))
        .map((x) => ({ id: x.id, name: x.name }));

    if (matchingGroups.length !== rawGroupNames.length) {
        const matchingGroupNames = matchingGroups.map((x) => x.name.toUpperCase());
        const unrecognizedGroups = rawGroupNames.filter((x) => !matchingGroupNames.includes(x.toUpperCase()));
        return {
            unmatchedGroups: unrecognizedGroups,
            matchedGroups: matchingGroups,
        };
    }
    return {
        matchedGroups: matchingGroups,
    };
}
