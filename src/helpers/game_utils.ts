import _ from "lodash";
import dbContext from "../database_context";
import { state } from "../kmq_worker";
import { IPCLogger } from "../logger";
import GameSession from "../structures/game_session";
import GuildPreference from "../structures/guild_preference";
import { MatchedArtist } from "../types";
import { Gender } from "../commands/game_options/gender";
import { GuessModeType } from "../commands/game_options/guessmode";
import { cleanArtistName, cleanSongName } from "../structures/game_round";
import { AnswerType } from "../commands/game_options/answer";
import SongSelector from "../structures/song_selector";

const GAME_SESSION_INACTIVE_THRESHOLD = 30;

const logger = new IPCLogger("game_utils");

interface GroupMatchResults {
    unmatchedGroups: Array<string>;
    matchedGroups?: Array<MatchedArtist>;
}

/**
 * Joins the VoiceChannel specified by GameSession, and stores the VoiceConnection
 * @param gameSession - The active GameSession
 */
export async function ensureVoiceConnection(
    gameSession: GameSession
): Promise<void> {
    const { client } = state;
    if (gameSession.connection && gameSession.connection.ready) return;
    const connection = await client.joinVoiceChannel(
        gameSession.voiceChannelID,
        { opusOnly: true, selfDeaf: true }
    );

    gameSession.connection = connection;
}

/**
 * @param guildPreference - The GuildPreference
 * @returns an object containing the total number of available songs before and after limit based on the GameOptions
 */
export async function getAvailableSongCount(
    guildPreference: GuildPreference
): Promise<{ count: number; countBeforeLimit: number }> {
    try {
        const { songs, countBeforeLimit } =
            await SongSelector.getFilteredSongList(guildPreference);

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
        const timeDiffMin = timeDiffMs / (1000 * 60);
        if (timeDiffMin > GAME_SESSION_INACTIVE_THRESHOLD) {
            inactiveSessions++;
            await gameSessions[guildID].endSession();
        }
    }

    if (inactiveSessions > 0) {
        logger.info(
            `Ended ${inactiveSessions} inactive game sessions out of ${totalSessions}`
        );
    }
}

/**
 * Gets or creates a GuildPreference
 * @param guildID - The Guild ID
 * @returns the correspond guild's GuildPreference
 */
export async function getGuildPreference(
    guildID: string
): Promise<GuildPreference> {
    const guildPreferences = await dbContext
        .kmq("guild_preferences")
        .select("*")
        .where("guild_id", "=", guildID);

    if (guildPreferences.length === 0) {
        const guildPreference = GuildPreference.fromGuild(guildID);
        await dbContext
            .kmq("guild_preferences")
            .insert({ guild_id: guildID, join_date: new Date() });
        return guildPreference;
    }

    const gameOptionPairs = (
        await dbContext
            .kmq("game_options")
            .select("*")
            .where({ guild_id: guildID })
    )
        .map((x) => ({ [x["option_name"]]: JSON.parse(x["option_value"]) }))
        .reduce((total, curr) => Object.assign(total, curr), {});

    const guildPreference = GuildPreference.fromGuild(
        guildPreferences[0].guild_id,
        gameOptionPairs
    );

    return guildPreference;
}

/**
 * @param userId - The user ID
 * @returns whether the player has bonus active
 */
export async function userBonusIsActive(userId: string): Promise<boolean> {
    return !!(await dbContext
        .kmq("top_gg_user_votes")
        .where("user_id", "=", userId)
        .where("buff_expiry_date", ">", new Date())
        .first());
}

/**
 * @param userId - The user ID
 * @returns whether the player has bonus active
 */
export async function activeBonusUsers(): Promise<Set<string>> {
    const bonusUsers = await dbContext
        .kmq("top_gg_user_votes")
        .where("buff_expiry_date", ">", new Date());

    return new Set(bonusUsers.map((x) => x.user_id));
}

/**
 * @param rawGroupNames - List of user-inputted group names
 * @param aliasApplied - Whether aliases have been applied
 * @returns a list of recognized/unrecognized groups
 */
export async function getMatchingGroupNames(
    rawGroupNames: Array<string>,
    aliasApplied = false
): Promise<GroupMatchResults> {
    const artistIDQuery = dbContext
        .kmq("kpop_groups")
        .select(["id"])
        .whereIn("name", rawGroupNames);

    const matchingGroups = (
        await dbContext
            .kmq("kpop_groups")
            .select(["id", "name"])
            .whereIn("id", [artistIDQuery])
            .orWhereIn("id_artist1", [artistIDQuery])
            .orWhereIn("id_artist2", [artistIDQuery])
            .orWhereIn("id_artist3", [artistIDQuery])
            .orWhereIn("id_artist4", [artistIDQuery])
            .orderBy("name", "ASC")
    ).map((x) => ({ id: x.id, name: x.name }));

    const matchingGroupNames = matchingGroups.map((x) => x.name.toUpperCase());
    const unrecognizedGroups = rawGroupNames.filter(
        (x) => !matchingGroupNames.includes(x.toUpperCase())
    );

    const result: GroupMatchResults = {
        unmatchedGroups: unrecognizedGroups,
        matchedGroups: matchingGroups,
    };

    if (result.unmatchedGroups.length > 0 && !aliasApplied) {
        let aliasFound = false;
        // apply artist aliases for unmatched groups
        for (let i = 0; i < result.unmatchedGroups.length; i++) {
            const groupName = result.unmatchedGroups[i];
            const matchingAlias = Object.entries(state.aliases.artist).find(
                (artistAliasTuple) =>
                    artistAliasTuple[1]
                        .map((x) => cleanArtistName(x))
                        .includes(cleanArtistName(groupName))
            );

            if (matchingAlias) {
                rawGroupNames[rawGroupNames.indexOf(groupName)] =
                    matchingAlias[0];
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

/**
 * @param answerType - The answer type
 * @param guessMode - The guess mode
 * @param gender - The correct answer's group's gender
 * @param answer - The correct answer
 * @param artistID - The correct answer's group's ID
 * @returns unshuffled incorrect choices based on difficulty
 */
export async function getMultipleChoiceOptions(
    answerType: AnswerType,
    guessMode: GuessModeType,
    gender: Gender,
    answer: string,
    artistID: number
): Promise<string[]> {
    let easyNames: string[];
    let names: string[];
    let result: string[];

    const EASY_CHOICES = 3;
    const MEDIUM_CHOICES = 5;
    const MEDIUM_SAME_ARIST_CHOICES = 2;
    const HARD_CHOICES = 7;

    const CHOICES_BY_DIFFICULTY = {
        [AnswerType.MULTIPLE_CHOICE_EASY]: EASY_CHOICES,
        [AnswerType.MULTIPLE_CHOICE_MED]: MEDIUM_CHOICES,
        [AnswerType.MULTIPLE_CHOICE_HARD]: HARD_CHOICES,
    };

    if (
        guessMode === GuessModeType.SONG_NAME ||
        guessMode === GuessModeType.BOTH
    ) {
        easyNames = (
            await dbContext
                .kmq("available_songs")
                .select("clean_song_name")
                .groupByRaw("UPPER(clean_song_name)")
                .where("members", gender)
                .andWhereRaw(
                    "NOT UPPER(clean_song_name) = ?",
                    answer.toUpperCase()
                )
                .andWhereNot("id_artist", artistID)
        ).map((x) => x["clean_song_name"]);
        switch (answerType) {
            case AnswerType.MULTIPLE_CHOICE_EASY: {
                // Easy: EASY_CHOICES from same gender as chosen artist
                result = _.sampleSize(easyNames, EASY_CHOICES);
                break;
            }

            case AnswerType.MULTIPLE_CHOICE_MED: {
                // Medium: MEDIUM_CHOICES - MEDIUM_SAME_ARIST_CHOICES from same gender as chosen artist, MEDIUM_SAME_ARIST_CHOICES from chosen artist
                const sameArtistSongs = _.sampleSize(
                    (
                        await dbContext
                            .kmq("available_songs")
                            .select("clean_song_name")
                            .groupByRaw("UPPER(clean_song_name)")
                            .where("id_artist", artistID)
                            .andWhereRaw(
                                "NOT UPPER(clean_song_name) = ?",
                                answer.toUpperCase()
                            )
                    ).map((x) => x["clean_song_name"]),
                    MEDIUM_SAME_ARIST_CHOICES
                );

                const sameGenderSongs = _.sampleSize(
                    (
                        await dbContext
                            .kmq("available_songs")
                            .select("clean_song_name")
                            .groupByRaw("UPPER(clean_song_name)")
                            .where("members", gender)
                            .andWhereRaw("UPPER(clean_song_name) NOT IN (?)", [
                                [...sameArtistSongs, answer].map((x) =>
                                    x.toUpperCase()
                                ),
                            ])
                            .andWhereNot("id_artist", artistID)
                    ).map((x) => x["clean_song_name"]),
                    MEDIUM_CHOICES - MEDIUM_SAME_ARIST_CHOICES
                );

                result = [...sameArtistSongs, ...sameGenderSongs];
                break;
            }

            case AnswerType.MULTIPLE_CHOICE_HARD: {
                // Hard: HARD_CHOICES from chosen artist
                names = (
                    await dbContext
                        .kmq("available_songs")
                        .select("clean_song_name")
                        .groupByRaw("UPPER(clean_song_name)")
                        .where("id_artist", artistID)
                        .andWhereRaw(
                            "NOT UPPER(clean_song_name) = ?",
                            answer.toUpperCase()
                        )
                ).map((x) => x["clean_song_name"]);
                result = _.sampleSize(names, HARD_CHOICES);
                break;
            }

            default:
                break;
        }

        const uniqueResult = new Map();
        const removedResults = [];
        for (const song of result) {
            if (uniqueResult.has(cleanSongName(song))) {
                removedResults.push(song);
                continue;
            }

            uniqueResult.set(cleanSongName(song), song);
        }

        result = [...uniqueResult.values()];

        if (result.length < CHOICES_BY_DIFFICULTY[answerType]) {
            easyNames = _.difference(easyNames, result, removedResults);
            for (const choice of _.sampleSize(
                easyNames,
                CHOICES_BY_DIFFICULTY[answerType] - result.length
            )) {
                result.push(choice);
            }
        }
    } else {
        easyNames = (
            await dbContext
                .kmq("available_songs")
                .select("artist_name")
                .whereNot("artist_name", answer)
        ).map((x) => x["artist_name"]);
        switch (answerType) {
            case AnswerType.MULTIPLE_CHOICE_EASY:
                // Easy: EASY_CHOICES from any artist
                result = _.sampleSize(easyNames, EASY_CHOICES);
                break;
            case AnswerType.MULTIPLE_CHOICE_MED:
            case AnswerType.MULTIPLE_CHOICE_HARD:
                // Medium: MEDIUM_CHOICES from same gender
                // Hard: HARD_CHOICES from same gender
                names = (
                    await dbContext
                        .kmq("available_songs")
                        .select("artist_name")
                        .where("members", gender)
                        .andWhereNot("artist_name", answer)
                ).map((x) => x["artist_name"]);
                result = _.sampleSize(names, CHOICES_BY_DIFFICULTY[answerType]);
                break;
            default:
                break;
        }
    }

    return result;
}
