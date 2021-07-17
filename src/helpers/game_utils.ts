import dbContext from "../database_context";
import { state } from "../kmq";
import _logger from "../logger";
import GameSession from "../structures/game_session";
import GuildPreference from "../structures/guild_preference";
import { MatchedArtist, QueriedSong } from "../types";
import { getForcePlaySong, isDebugMode, isForcedSongActive } from "./debug_utils";
import { Gender } from "../commands/game_options/gender";
import { ArtistType } from "../commands/game_options/artisttype";
import { FOREIGN_LANGUAGE_TAGS, LanguageType } from "../commands/game_options/language";
import { SubunitsPreference } from "../commands/game_options/subunits";
import { OstPreference } from "../commands/game_options/ost";
import { NON_OFFICIAL_VIDEO_TAGS, ReleaseType } from "../commands/game_options/release";
import { cleanArtistName } from "../structures/game_round";

const GAME_SESSION_INACTIVE_THRESHOLD = 30;

const logger = _logger("game_utils");

interface GroupMatchResults {
    unmatchedGroups: Array<string>;
    matchedGroups?: Array<MatchedArtist>;
}

/**
 * Returns a list of songs from the data store, narrowed down by the specified game options
 * @param guildPreference - The GuildPreference
 * @returns a list of songs, as well as the number of songs before the filter option was applied
 */
export async function getFilteredSongList(guildPreference: GuildPreference): Promise<{ songs: Set<QueriedSong>, countBeforeLimit: number }> {
    const fields = ["song_name as name", "artist_name as artist", "link as youtubeLink",
        "publishedon as publishDate", "members", "id_artist as artistID", "issolo as isSolo", "members", "tags"];
    let queryBuilder = dbContext.kmq("available_songs")
        .select(fields)
        .where(function artistFilter() {
            this.where(function includesInnerArtistFilter() {
                if (!guildPreference.isGroupsMode()) {
                    if (guildPreference.getSubunitPreference() === SubunitsPreference.EXCLUDE) {
                        this.whereIn("id_artist", guildPreference.getIncludesGroupIDs());
                    } else {
                        this.andWhere(function () {
                            this.whereIn("id_artist", guildPreference.getIncludesGroupIDs())
                                .orWhereIn("id_parent_artist", guildPreference.getIncludesGroupIDs());
                        });
                    }
                }
            }).orWhere(function mainInnerArtistFilter() {
                this.whereNotIn("id_artist", guildPreference.getExcludesGroupIDs());
                if (!guildPreference.isGroupsMode()) {
                    const gender = guildPreference.isGenderAlternating() ? [Gender.MALE, Gender.FEMALE, Gender.COED] : guildPreference.getGender();
                    this.whereIn("members", gender);

                    // filter by artist type only in non-groups
                    if (guildPreference.getArtistType() !== ArtistType.BOTH) {
                        this.andWhere("issolo", "=", guildPreference.getArtistType() === ArtistType.SOLOIST ? "y" : "n");
                    }
                } else {
                    if (guildPreference.getSubunitPreference() === SubunitsPreference.EXCLUDE) {
                        this.whereIn("id_artist", guildPreference.getGroupIDs());
                    } else {
                        const subunits = dbContext.kmq("kpop_groups").select("id").whereIn("id_parentgroup", guildPreference.getGroupIDs());
                        const collabGroupContainingSubunit = dbContext.kmq("kpop_groups").select("id")
                            .whereIn("id_artist1", subunits)
                            .orWhereIn("id_artist2", subunits)
                            .orWhereIn("id_artist3", subunits)
                            .orWhereIn("id_artist4", subunits);
                        this.andWhere(function () {
                            this.whereIn("id_artist", guildPreference.getGroupIDs())
                                .orWhereIn("id_parent_artist", guildPreference.getGroupIDs())
                                .orWhereIn("id_artist", collabGroupContainingSubunit);
                        });
                    }
                }
            });
        });

    if (guildPreference.getLanguageType() === LanguageType.KOREAN) {
        for (const tag of FOREIGN_LANGUAGE_TAGS) {
            queryBuilder = queryBuilder
                .where("tags", "NOT LIKE", `%${tag}%`);
        }
    }

    if (guildPreference.getOstPreference() === OstPreference.EXCLUDE) {
        queryBuilder = queryBuilder
            .where("tags", "NOT LIKE", "%o%");
    } else if (guildPreference.getOstPreference() === OstPreference.EXCLUSIVE) {
        queryBuilder = queryBuilder
            .where("tags", "LIKE", "%o%");
    }

    if (guildPreference.getReleaseType() === ReleaseType.OFFICIAL) {
        queryBuilder = queryBuilder.where("vtype", "=", "main");
        for (const tag of NON_OFFICIAL_VIDEO_TAGS) {
            queryBuilder = queryBuilder
                .where("tags", "NOT LIKE", `%${tag}%`);
        }
    }

    queryBuilder = queryBuilder
        .andWhere("publishedon", ">=", `${guildPreference.getBeginningCutoffYear()}-01-01`)
        .andWhere("publishedon", "<=", `${guildPreference.getEndCutoffYear()}-12-31`)
        .orderBy("views", "DESC");

    let result: Array<QueriedSong> = await queryBuilder;

    const count = result.length;
    result = result.slice(guildPreference.getLimitStart(), guildPreference.getLimitEnd());
    return {
        songs: new Set(result),
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
export async function selectRandomSong(filteredSongs: Set<QueriedSong>, ignoredSongs?: Set<string>, alternatingGender?: Gender): Promise<QueriedSong> {
    if (isDebugMode() && isForcedSongActive()) {
        const forcePlayedQueriedSong = await getForcePlaySong();
        logger.info(`Force playing ${forcePlayedQueriedSong.name} by ${forcePlayedQueriedSong.artist} | ${forcePlayedQueriedSong.youtubeLink}`);
        return forcePlayedQueriedSong;
    }
    let queriedSongList = [...filteredSongs];
    if (ignoredSongs) {
        queriedSongList = queriedSongList.filter((x) => !ignoredSongs.has(x.youtubeLink));
    }
    if (alternatingGender && queriedSongList.some((y) => y.members === alternatingGender || y.members === Gender.COED)) {
        queriedSongList = queriedSongList.filter((song) => song.members === alternatingGender || song.members === Gender.COED);
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
            count: songs.size,
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
    for (const guildID of Object.keys(gameSessions)) {
        const gameSession = gameSessions[guildID];
        const timeDiffMs = currentDate - gameSession.lastActive;
        const timeDiffMin = (timeDiffMs / (1000 * 60));
        if (timeDiffMin > GAME_SESSION_INACTIVE_THRESHOLD) {
            inactiveSessions++;
            await gameSessions[guildID].endSession();
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
    const guildPreferences = await dbContext.kmq("guild_preferences").select("*").where("guild_id", "=", guildID);
    if (guildPreferences.length === 0) {
        const guildPreference = GuildPreference.fromGuild(guildID);
        await dbContext.kmq("guild_preferences")
            .insert({ guild_id: guildID, join_date: new Date() });
        return guildPreference;
    }
    const gameOptionPairs = (await dbContext.kmq("game_options")
        .select("*")
        .where({ guild_id: guildID }))
        .map((x) => ({ [x["option_name"]]: JSON.parse(x["option_value"]) }))
        .reduce(((total, curr) => Object.assign(total, curr)), {});
    return GuildPreference.fromGuild(guildPreferences[0].guild_id, gameOptionPairs);
}

/**
 * @param rawGroupNames - List of user-inputted group names
 * @returns a list of recognized/unrecognized groups
 */
export async function getMatchingGroupNames(rawGroupNames: Array<string>, aliasApplied = false): Promise<GroupMatchResults> {
    const artistIDQuery = dbContext.kmq("kpop_groups")
        .select(["id"])
        .whereIn("name", rawGroupNames);

    const matchingGroups = (await dbContext.kmq("kpop_groups")
        .select(["id", "name"])
        .whereIn("id", [artistIDQuery])
        .orWhereIn("id_artist1", [artistIDQuery])
        .orWhereIn("id_artist2", [artistIDQuery])
        .orWhereIn("id_artist3", [artistIDQuery])
        .orWhereIn("id_artist4", [artistIDQuery])
        .orderBy("name", "ASC"))
        .map((x) => ({ id: x.id, name: x.name }));

    const matchingGroupNames = matchingGroups.map((x) => x.name.toUpperCase());
    const unrecognizedGroups = rawGroupNames.filter((x) => !matchingGroupNames.includes(x.toUpperCase()));
    const result: GroupMatchResults = { unmatchedGroups: unrecognizedGroups, matchedGroups: matchingGroups };
    if (result.unmatchedGroups.length > 0 && !aliasApplied) {
        let aliasFound = false;
        // apply artist aliases for unmatched groups
        for (let i = 0; i < result.unmatchedGroups.length; i++) {
            const groupName = result.unmatchedGroups[i];
            const matchingAlias = Object.entries(state.aliases.artist).find((artistAliasTuple) => artistAliasTuple[1].map((x) => cleanArtistName(x)).includes(cleanArtistName(groupName)));
            if (matchingAlias) {
                rawGroupNames[rawGroupNames.indexOf(groupName)] = matchingAlias[0];
                aliasFound = true;
            }
        }
        if (aliasFound) {
            // try again but with aliases
            return getMatchingGroupNames(rawGroupNames, true);
        }
    }

    return result;
}
