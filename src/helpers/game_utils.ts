import dbContext from "../database_context";
import state from "../kmq";
import _logger from "../logger";
import GameSession from "../structures/game_session";
import GuildPreference from "../structures/guild_preference";
import { QueriedSong } from "../types";
import { getForcePlaySong, isDebugMode, isForcedSongActive } from "./debug_utils";
import { sendEndGameMessage } from "./discord_utils";
import { Gender } from "../commands/game_options/gender";
import { ArtistType } from "../commands/game_options/artisttype";
import { LanguageType } from "../commands/game_options/language";
import { SubunitsPreference } from "../commands/game_options/subunits";

const GAME_SESSION_INACTIVE_THRESHOLD = 30;

const logger = _logger("game_utils");

interface GroupMatchResults {
    unmatchedGroups?: Array<string>;
    matchedGroups?: { id: number, name: string }[];
}

/**
 * Returns a list of songs from the data store, narrowed down by the specified game options
 * @param guildPreference - The GuildPreference
 * @param ignoredSongs - List of YouTube video IDs of songs to ignore
 * @returns a list of songs, as well as the number of songs before the filter option was applied
 */
export async function getFilteredSongList(guildPreference: GuildPreference, ignoredSongs?: Set<string>, genderOverride?: Gender): Promise<{ songs: QueriedSong[], countBeforeLimit: number }> {
    const fields = ["song_name as name", "artist_name as artist", "link as youtubeLink", "publishedon as publishDate", "members", "id_artist as artistId", "issolo as isSolo", "members"];
    let queryBuilder = dbContext.kmq("available_songs")
        .select(fields)
        .where(function artistFilter() {
            this.where(function includesInnerArtistFilter() {
                if (!guildPreference.isGroupsMode()) {
                    if (guildPreference.getSubunitPreference() === SubunitsPreference.EXCLUDE) {
                        this.whereIn("id_artist", guildPreference.getIncludesGroupIds());
                    } else {
                        this.andWhere(function () {
                            this.whereIn("id_artist", guildPreference.getIncludesGroupIds())
                                .orWhereIn("id_parent_artist", guildPreference.getIncludesGroupIds());
                        });
                    }
                }
            }).orWhere(function mainInnerArtistFilter() {
                this.whereNotIn("id_artist", guildPreference.getExcludesGroupIds());
                if (!guildPreference.isGroupsMode()) {
                    const gender = guildPreference.isGenderAlternating() ? [Gender.MALE, Gender.FEMALE] : guildPreference.getGender();
                    this.whereIn("members", gender);

                    // filter by artist type only in non-groups
                    if (guildPreference.getArtistType() !== ArtistType.BOTH) {
                        this.andWhere("issolo", "=", guildPreference.getArtistType() === ArtistType.SOLOIST ? "y" : "n");
                    }
                } else {
                    // eslint-disable-next-line no-lonely-if
                    if (guildPreference.getSubunitPreference() === SubunitsPreference.EXCLUDE) {
                        this.whereIn("id_artist", guildPreference.getGroupIds());
                    } else {
                        this.andWhere(function () {
                            this.whereIn("id_artist", guildPreference.getGroupIds())
                                .orWhereIn("id_parent_artist", guildPreference.getGroupIds());
                        });
                    }
                }
            });
        });

    if (guildPreference.getLanguageType() === LanguageType.KOREAN) {
        queryBuilder = queryBuilder
            .where("song_name", "NOT LIKE", "%(cn)%")
            .where("song_name", "NOT LIKE", "%(en)%")
            .where("song_name", "NOT LIKE", "%(jp)%");
    }
    queryBuilder = queryBuilder
        .andWhere("publishedon", ">=", `${guildPreference.getBeginningCutoffYear()}-01-01`)
        .andWhere("publishedon", "<=", `${guildPreference.getEndCutoffYear()}-12-31`)
        .orderBy("views", "DESC");

    let result: Array<QueriedSong> = await queryBuilder;

    const count = result.length;
    result = result.slice(guildPreference.getLimitStart(), guildPreference.getLimitEnd());
    if (ignoredSongs && ignoredSongs.size > 0) {
        result = result.filter((song) => !ignoredSongs.has(song.youtubeLink));
    }
    if (guildPreference.isGenderAlternating() && genderOverride) {
        const alternatingResult = await dbContext.kmq("available_songs")
            .select(fields)
            .whereIn("link", result.map((song) => song.youtubeLink))
            .andWhere("members", "=", [genderOverride]);
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
    if (gameSession.connection && gameSession.connection.ready) return;
    const connection = await client.joinVoiceChannel(gameSession.voiceChannelID, { opusOnly: true });
    // deafen self
    connection.updateVoiceState(false, true);
    gameSession.connection = connection;
}

/**
 * Selects a random song based on the GameOptions, avoiding recently played songs
 * @param guildPreference - The GuildPreference
 * @param ignoredSongs - The union of last played songs and unique songs to not select from
 * @param alternatingGender - The gender to limit selecting from if ,gender alternating
 */
export async function selectRandomSong(guildPreference: GuildPreference, ignoredSongs: Set<string>, alternatingGender?: Gender): Promise<QueriedSong> {
    if (isDebugMode() && isForcedSongActive()) {
        const forcePlayedQueriedSong = await getForcePlaySong();
        logger.info(`Force playing ${forcePlayedQueriedSong.name} by ${forcePlayedQueriedSong.artist} | ${forcePlayedQueriedSong.youtubeLink}`);
        return forcePlayedQueriedSong;
    }
    let queriedSongList: Array<QueriedSong>;
    if (alternatingGender) {
        queriedSongList = (await getFilteredSongList(guildPreference, ignoredSongs, alternatingGender)).songs;
    } else {
        queriedSongList = (await getFilteredSongList(guildPreference, ignoredSongs)).songs;
    }
    if (queriedSongList.length === 0) {
        return null;
    }

    return queriedSongList[Math.floor(Math.random() * queriedSongList.length)];
}

/**
 * @param guildPreference - The GuildPreference
 * @returns an object containing the total number of available songs before and after limit based on the GameOptions
 */
export async function getSongCount(guildPreference: GuildPreference): Promise<{ count: number; countBeforeLimit: number }> {
    try {
        const { songs, countBeforeLimit } = await getFilteredSongList(guildPreference);
        return {
            count: songs.length,
            countBeforeLimit,
        };
    } catch (e) {
        logger.error(`Error retrieving song count ${e}`);
        return null;
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
        const guildPreference = GuildPreference.fromGuild(guildID);
        await dbContext.kmq("guild_preferences")
            .insert({ guild_id: guildID, guild_preference: JSON.stringify(guildPreference), join_date: new Date() });
        return guildPreference;
    }
    return GuildPreference.fromGuild(guildPreferences[0].guild_id, JSON.parse(guildPreferences[0].guild_preference));
}

/**
 * Perform end of GameSession cleanup activities
 * @param gameSession - The GameSession to end
 */
export async function endSession(gameSession: GameSession) {
    await sendEndGameMessage(gameSession.textChannelID, gameSession);
    await gameSession.endSession();
}

/**
 * @param rawGroupNames - List of user-inputted group names
 * @returns a list of recognized/unrecognized groups
 */
export async function getMatchingGroupNames(rawGroupNames: Array<string>): Promise<GroupMatchResults> {
    const artistIdQuery = dbContext.kmq("kpop_groups")
        .select(["id"])
        .whereIn("name", rawGroupNames);

    const matchingGroups = (await dbContext.kmq("kpop_groups")
        .select(["id", "name"])
        .whereIn("id", [artistIdQuery])
        .orWhereIn("id_artist1", [artistIdQuery])
        .orWhereIn("id_artist2", [artistIdQuery])
        .orWhereIn("id_artist3", [artistIdQuery])
        .orWhereIn("id_artist4", [artistIdQuery])
        .orderBy("name", "ASC"))
        .map((x) => ({ id: x.id, name: x.name }));

    const matchingGroupNames = matchingGroups.map((x) => x.name.toUpperCase());
    const unrecognizedGroups = rawGroupNames.filter((x) => !matchingGroupNames.includes(x.toUpperCase()));
    if (unrecognizedGroups.length) {
        return {
            unmatchedGroups: unrecognizedGroups,
            matchedGroups: matchingGroups,
        };
    }
    return {
        matchedGroups: matchingGroups,
    };
}
