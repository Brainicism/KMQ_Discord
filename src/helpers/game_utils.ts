import { IPCLogger } from "../logger";
import { containsHangul, md5Hash } from "./utils";
import { sql } from "kysely";
import AnswerType from "../enums/option_types/answer_type";
import GameRound from "../structures/game_round";
import GuessModeType from "../enums/option_types/guess_mode_type";
import LocaleType from "../enums/locale_type";
import _ from "lodash";
import dbContext from "../database_context";
import type { AvailableGenders } from "../enums/option_types/gender";
import type GameSession from "../structures/game_session";
import type GuildPreference from "../structures/guild_preference";
import type KmqClient from "../kmq_client";
import type ListeningSession from "../structures/listening_session";
import type MatchedArtist from "../interfaces/matched_artist";
import type Session from "../structures/session";

const GAME_SESSION_INACTIVE_THRESHOLD = 10;
const logger = new IPCLogger("game_utils");

interface GroupMatchResults {
    unmatchedGroups: Array<string>;
    matchedGroups: Array<MatchedArtist>;
}

/**
 * Joins the VoiceChannel specified by GameSession, and stores the VoiceConnection
 * @param client - The bot instance
 * @param session - The active Session
 */
export async function ensureVoiceConnection(
    client: KmqClient,
    session: Session,
): Promise<void> {
    if (session.connection && session.connection.ready) return;
    const connection = await client.joinVoiceChannel(session.voiceChannelID, {
        opusOnly: true,
        selfDeaf: true,
    });

    session.connection = connection;
}

/**
 * @param guildPreference - The GuildPreference
 * @returns an object containing the total number of available songs before and after limit based on the GameOptions
 */
export async function getAvailableSongCount(
    guildPreference: GuildPreference,
): Promise<{
    count: number | undefined;
    countBeforeLimit: number | undefined;
    ineligibleDueToCommonAlias: number | undefined;
}> {
    try {
        const songSelector = guildPreference.songSelector;

        // only reload if song selector has never loaded yet, otherwise used cached count
        if (songSelector.getSongs().songs.size === 0) {
            await songSelector.reloadSongs();
        }

        const songSelectorResults = songSelector.getSongs();

        if (guildPreference.isPlaylist()) {
            return {
                count: songSelectorResults.songs.size,
                countBeforeLimit: songSelectorResults.songs.size,
                ineligibleDueToCommonAlias:
                    songSelectorResults.ineligibleDueToCommonAlias,
            };
        }

        return {
            count: songSelectorResults.songs.size,
            countBeforeLimit: songSelectorResults.countBeforeLimit,
            ineligibleDueToCommonAlias:
                songSelectorResults.ineligibleDueToCommonAlias,
        };
    } catch (e) {
        logger.error(
            `gid: ${guildPreference.guildID} | Error retrieving song count ${e.stack}`,
        );
        return {
            count: undefined,
            countBeforeLimit: undefined,
            ineligibleDueToCommonAlias: undefined,
        };
    }
}

/** Cleans up inactive GameSessions
 * @param gameSessions - All game sessions
 */
export async function cleanupInactiveGameSessions(gameSessions: {
    [guildID: string]: GameSession;
}): Promise<void> {
    const currentDate = Date.now();
    let inactiveSessions = 0;
    const totalSessions = Object.keys(gameSessions).length;

    await Promise.allSettled(
        Object.keys(gameSessions).map(async (guildID) => {
            const gameSession = gameSessions[guildID];
            if (!gameSession) return;
            const timeDiffMs = currentDate - gameSession.lastActive;
            const timeDiffMin = timeDiffMs / (1000 * 60);
            if (timeDiffMin > GAME_SESSION_INACTIVE_THRESHOLD) {
                inactiveSessions++;
                await gameSession.endSession("Inactive game session", false);
            }
        }),
    );

    if (inactiveSessions > 0) {
        logger.info(
            `Ended ${inactiveSessions} inactive game sessions out of ${totalSessions}`,
        );
    }
}

/** Cleans up inactive ListeningSessions
 * @param listeningSessions - All listening sessions
 */
export async function cleanupInactiveListeningSessions(listeningSessions: {
    [guildID: string]: ListeningSession;
}): Promise<void> {
    let inactiveSessions = 0;
    const totalSessions = Object.keys(listeningSessions).length;
    await Promise.allSettled(
        Object.keys(listeningSessions).map(async (guildID) => {
            const listeningSession = listeningSessions[guildID];
            if (!listeningSession) return;
            if (listeningSession.getVoiceMembers().length === 0) {
                await listeningSession.endSession("Empty listening session");
                inactiveSessions++;
            }
        }),
    );

    if (inactiveSessions > 0) {
        logger.warn(
            `Ended ${inactiveSessions} inactive listening sessions out of ${totalSessions}`,
        );
    }
}

/**
 * @param userId - The user ID
 * @returns whether the player has bonus active
 */
export async function userBonusIsActive(userId: string): Promise<boolean> {
    return !!(await dbContext.kmq
        .selectFrom("top_gg_user_votes")
        .select("buff_expiry_date")
        .where("user_id", "=", userId)
        .where("buff_expiry_date", ">", new Date())
        .executeTakeFirst());
}

/**
 * @returns whether the player has bonus active
 */
export async function activeBonusUsers(): Promise<Set<string>> {
    const bonusUsers = await dbContext.kmq
        .selectFrom("top_gg_user_votes")
        .select("user_id")
        .where("buff_expiry_date", ">", new Date())
        .execute();

    return new Set(bonusUsers.map((x) => x.user_id));
}

/**
 * Returns a list of similar group names
 * @param groupName - The group name
 * @param locale - The locale
 * @returns - similar group names
 */
export async function getSimilarGroupNames(
    groupName: string,
    locale: LocaleType,
): Promise<Array<string>> {
    const similarGroups = await dbContext.kpopVideos
        .selectFrom("app_kpop_group_safe")
        .select(["id", "name", "kname"])
        .where("is_collab", "=", "n")
        .where("has_songs", "=", 1)
        .where(({ or, eb }) =>
            or([
                eb("name", "like", `%${groupName}%`),
                eb("kname", "like", `%${groupName}%`),
            ]),
        )
        .orderBy((eb) => eb.fn("CHAR_LENGTH", ["name"]), "asc")
        .limit(5)
        .execute();

    if (similarGroups.length === 0) return [];
    return similarGroups.map((x) =>
        locale !== LocaleType.KO ? x["name"] : x["kname"] || x["name"],
    );
}

/**
 * @param artistAliases - A list of aliases for every artist
 * @param rawGroupNames - List of user-inputted group names
 * @param aliasApplied - Whether aliases have been applied
 * @returns a list of recognized/unrecognized groups
 */
export async function getMatchingGroupNames(
    artistAliases: { [artistName: string]: Array<string> },
    rawGroupNames: Array<string>,
    aliasApplied = false,
): Promise<GroupMatchResults> {
    const artistIds = (
        await dbContext.kpopVideos
            .selectFrom("app_kpop_group_safe")
            .select(["id"])
            .where("name", "in", rawGroupNames)
            .where("has_songs", "=", 1)
            .execute()
    ).map((x) => x.id);

    const matchingGroups = (
        await dbContext.kpopVideos // collab matches
            .selectFrom("app_kpop_agrelation")
            .innerJoin(
                "app_kpop_group_safe",
                "app_kpop_agrelation.id_subgroup",
                "app_kpop_group_safe.id",
            )
            .select(["id", "name"])
            .where("app_kpop_agrelation.id_artist", "in", artistIds)
            .where("app_kpop_group_safe.is_collab", "=", "y")
            // artist matches
            .unionAll(
                dbContext.kpopVideos
                    .selectFrom("app_kpop_group_safe")
                    .select(["id", "name"])
                    .where("app_kpop_group_safe.id", "in", artistIds),
            )
            .orderBy("name", "asc")
            .execute()
    ).map((x) => {
        if (artistIds.includes(x.id)) {
            return { id: x.id, name: x.name, added_by_user: "y" };
        } else {
            return { id: x.id, name: x.name, added_by_user: "n" };
        }
    });

    const matchingGroupNames = matchingGroups.map((x) => x.name.toUpperCase());
    const unrecognizedGroups = rawGroupNames.filter(
        (x) => !matchingGroupNames.includes(x.toUpperCase()),
    );

    const result: GroupMatchResults = {
        unmatchedGroups: unrecognizedGroups,
        matchedGroups: matchingGroups,
    };

    if (result.unmatchedGroups.length > 0 && !aliasApplied) {
        let aliasFound = false;
        // apply artist aliases for unmatched groups
        for (let i = 0; i < result.unmatchedGroups.length; i++) {
            const groupName = result.unmatchedGroups[i]!;
            const matchingAlias = Object.entries(artistAliases).find(
                (artistAliasTuple) =>
                    artistAliasTuple[1]
                        .map((x) => GameRound.normalizePunctuationInName(x))
                        .includes(
                            GameRound.normalizePunctuationInName(groupName),
                        ),
            );

            if (matchingAlias) {
                rawGroupNames[rawGroupNames.indexOf(groupName)] =
                    matchingAlias[0];
                aliasFound = true;
            }
        }

        if (aliasFound) {
            // try again but with aliases
            return getMatchingGroupNames(artistAliases, rawGroupNames, true);
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
 * @param locale - The server's locale
 * @returns unshuffled incorrect choices based on difficulty
 */
export async function getMultipleChoiceOptions(
    answerType: AnswerType,
    guessMode: GuessModeType,
    gender: AvailableGenders,
    answer: string,
    artistID: number,
    locale: LocaleType,
): Promise<string[]> {
    const useHangul = locale === LocaleType.KO && containsHangul(answer);
    let easyNames: string[];
    let names: string[];
    let result: string[];

    const EASY_CHOICES = 3;
    const MEDIUM_CHOICES = 5;
    const MEDIUM_SAME_ARTIST_CHOICES = 2;
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
        const pickNonEmpty = (results: {
            song_name_en: string;
            song_name_ko: string;
        }): string => {
            if (locale === LocaleType.KO && results.song_name_ko && useHangul) {
                return results.song_name_ko;
            }

            return results.song_name_en;
        };

        const songName = useHangul ? "song_name_ko" : "song_name_en";

        easyNames = (
            await dbContext.kmq
                .selectFrom("available_songs")
                .select(["song_name_en", "song_name_ko"])
                .groupBy(songName)
                .where("members", "=", gender)
                .where(songName, "!=", answer)
                .where("id_artist", "!=", artistID)
                .execute()
        ).map((x) => pickNonEmpty(x));
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
                        await dbContext.kmq
                            .selectFrom("available_songs")
                            .select(["song_name_en", "song_name_ko"])
                            .groupBy(songName)
                            .where("id_artist", "=", artistID)
                            .where(songName, "!=", answer)
                            .execute()
                    ).map((x) => pickNonEmpty(x)),
                    MEDIUM_SAME_ARTIST_CHOICES,
                );

                const sameGenderSongs = _.sampleSize(
                    (
                        await dbContext.kmq
                            .selectFrom("available_songs")
                            .select(["song_name_en", "song_name_ko"])
                            .groupBy(songName)
                            .where("members", "=", gender)
                            .where(songName, "not in", [
                                ...sameArtistSongs,
                                answer,
                            ])
                            .where("id_artist", "=", artistID)
                            .execute()
                    ).map((x) => pickNonEmpty(x)),
                    MEDIUM_CHOICES - MEDIUM_SAME_ARTIST_CHOICES,
                );

                result = [...sameArtistSongs, ...sameGenderSongs];
                break;
            }

            case AnswerType.MULTIPLE_CHOICE_HARD: {
                // Hard: HARD_CHOICES from chosen artist
                names = (
                    await dbContext.kmq
                        .selectFrom("available_songs")
                        .select(["song_name_en", "song_name_ko"])
                        .groupBy(songName)
                        .where("id_artist", "=", artistID)
                        .where(songName, "!=", answer)
                        .execute()
                ).map((x) => pickNonEmpty(x));
                result = _.sampleSize(names, HARD_CHOICES);
                break;
            }

            default:
                logger.error(`Unexpected answer type: ${answerType}`);
                result = _.sampleSize(easyNames, EASY_CHOICES);
                break;
        }

        const uniqueResult = new Map();
        const removedResults: Array<string> = [];
        for (const song of result) {
            if (uniqueResult.has(GameRound.normalizePunctuationInName(song))) {
                removedResults.push(song);
                continue;
            }

            uniqueResult.set(GameRound.normalizePunctuationInName(song), song);
        }

        result = [...uniqueResult.values()];

        const numChoices =
            CHOICES_BY_DIFFICULTY[
                answerType as keyof typeof CHOICES_BY_DIFFICULTY
            ];

        if (result.length < numChoices) {
            easyNames = _.difference(easyNames, result, removedResults);
            for (const choice of _.sampleSize(
                easyNames,
                numChoices - result.length,
            )) {
                result.push(choice);
            }
        }
    } else {
        const pickNonEmpty = (results: {
            artist_name_en: string;
            artist_name_ko: string | null;
        }): string => {
            if (
                locale === LocaleType.KO &&
                results.artist_name_ko &&
                useHangul
            ) {
                return results.artist_name_ko;
            }

            return results.artist_name_en;
        };

        const artistName = useHangul ? "artist_name_ko" : "artist_name_en";
        easyNames = (
            await dbContext.kmq
                .selectFrom("available_songs")
                .select(["artist_name_en", "artist_name_ko"])
                .where(artistName, "!=", answer)
                .execute()
        ).map((x) => pickNonEmpty(x));
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
                    await dbContext.kmq
                        .selectFrom("available_songs")
                        .select(["artist_name_en", "artist_name_ko"])
                        .where("members", "=", gender)
                        .where(artistName, "!=", answer)
                        .execute()
                ).map((x) => pickNonEmpty(x));
                result = _.sampleSize(names, CHOICES_BY_DIFFICULTY[answerType]);
                break;
            default:
                logger.error(`Unexpected answerType: ${answerType}`);
                result = _.sampleSize(easyNames, EASY_CHOICES);
                break;
        }
    }

    return result;
}

/**
 * @param userID - The user's ID
 * @returns whether this is the user's first game played today
 */
export async function isFirstGameOfDay(userID: string): Promise<boolean> {
    const player = await dbContext.kmq
        .selectFrom("player_stats")
        .select([
            sql<number>`DAYOFYEAR(last_game_started_at) = DAYOFYEAR(CURDATE())`.as(
                "firstGameOfDay",
            ),
            "last_game_played_errored",
        ])
        .where("player_id", "=", userID)
        .executeTakeFirst();

    if (!player) return true;
    const isFirstGame = player["firstGameOfDay"] === 0;
    const lastGameEndedDueError = player["last_game_played_errored"] === 1;

    return lastGameEndedDueError || isFirstGame;
}

/**
 * @param daisukiEntry - The song to retrieve the tags from
 * @returns the tags in the form of discord emoji's in a string;
 * Tags are language tags.
 */
export function getEmojisFromSongTags(daisukiEntry: {
    tags: string | null;
}): string {
    let tagText: string = "";
    if (daisukiEntry.tags === null) {
        return tagText;
    }

    if (daisukiEntry.tags.includes("e")) {
        tagText += " :flag_gb:"; // English
    }

    if (daisukiEntry.tags.includes("z")) {
        tagText += " :flag_cn:"; // Chinese
    }

    if (daisukiEntry.tags.includes("j")) {
        tagText += " :flag_jp:"; // Japanese
    }

    if (daisukiEntry.tags.includes("s")) {
        tagText += " :flag_es:"; // Spanish
    }

    if (daisukiEntry.tags.includes("l")) {
        tagText += " :globe_with_meridians:"; // Other Language
    }

    return tagText;
}

/** @returns whether its a KMQ power hour */
export function isPowerHour(): boolean {
    const date = new Date();
    const dateSeed =
        (date.getDate() * 31 + date.getMonth()) * 31 + date.getFullYear();

    // distribute between each third of the day to accommodate timezone differences
    const powerHours = [
        md5Hash(dateSeed, 8) % 7,
        (md5Hash(dateSeed + 1, 8) % 7) + 8,
        (md5Hash(dateSeed + 2, 8) % 7) + 16,
    ];

    const currentHour = date.getHours();
    return powerHours.some(
        (powerHour) => currentHour >= powerHour && currentHour <= powerHour + 1,
    );
}
