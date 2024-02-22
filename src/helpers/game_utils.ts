import { IPCLogger } from "../logger";
import { SHADOW_BANNED_ARTIST_IDS } from "../constants";
import {
    cleanArtistName,
    normalizePunctuationInName,
} from "../structures/game_round";
import { containsHangul, md5Hash } from "./utils";
import { sql } from "kysely";
import AnswerType from "../enums/option_types/answer_type";
import GameType from "../enums/game_type";
import GuessModeType from "../enums/option_types/guess_mode_type";
import LocaleType from "../enums/locale_type";
import SongSelector from "../structures/song_selector";
import State from "../state";
import _ from "lodash";
import dbContext from "../database_context";
import type { AvailableGenders } from "../enums/option_types/gender";
import type Eris from "eris";
import type GameRound from "../structures/game_round";
import type GuildPreference from "../structures/guild_preference";
import type MatchedArtist from "../interfaces/matched_artist";
import type MessageContext from "../structures/message_context";
import type QueriedSong from "../interfaces/queried_song";
import type Session from "../structures/session";

const GAME_SESSION_INACTIVE_THRESHOLD = 10;
const logger = new IPCLogger("game_utils");

interface GroupMatchResults {
    unmatchedGroups: Array<string>;
    matchedGroups: Array<MatchedArtist>;
}

/**
 * Joins the VoiceChannel specified by GameSession, and stores the VoiceConnection
 * @param session - The active Session
 */
export async function ensureVoiceConnection(session: Session): Promise<void> {
    const { client } = State;
    if (session.connection && session.connection.ready) return;
    const connection = await client.joinVoiceChannel(session.voiceChannelID, {
        opusOnly: true,
        selfDeaf: true,
    });

    session.connection = connection;
}

/**
 * @param guildPreference - The GuildPreference
 * @param messageContext - The message which triggered the song count check
 * @param interaction - The interaction that triggered the song count check
 * @returns an object containing the total number of available songs before and after limit based on the GameOptions
 */
export async function getAvailableSongCount(
    guildPreference: GuildPreference,
    messageContext?: MessageContext,
    interaction?: Eris.CommandInteraction,
): Promise<{
    count: number | undefined;
    countBeforeLimit: number | undefined;
}> {
    try {
        if (guildPreference.isPlaylist()) {
            const kmqPlaylistIdentifier = guildPreference.getKmqPlaylistID()!;

            const playlistMetadata =
                await State.playlistManager.getMatchedPlaylistMetadata(
                    guildPreference.guildID,
                    kmqPlaylistIdentifier,
                    false,
                    messageContext,
                    interaction,
                );

            return {
                count: playlistMetadata.matchedSongsLength,
                countBeforeLimit: playlistMetadata.matchedSongsLength,
            };
        }

        const { songs, countBeforeLimit } =
            await SongSelector.getFilteredSongList(
                guildPreference,
                SHADOW_BANNED_ARTIST_IDS,
            );

        return {
            count: songs.size,
            countBeforeLimit,
        };
    } catch (e) {
        logger.error(
            `gid: ${guildPreference.guildID} | Error retrieving song count ${e.stack}`,
        );
        return {
            count: undefined,
            countBeforeLimit: undefined,
        };
    }
}

/** Cleans up inactive GameSessions */
export async function cleanupInactiveGameSessions(): Promise<void> {
    const { gameSessions } = State;
    const currentDate = Date.now();
    let inactiveSessions = 0;
    const totalSessions = Object.keys(gameSessions).length;

    await Promise.allSettled(
        Object.keys(gameSessions).map(async (guildID) => {
            const gameSession = gameSessions[guildID];
            const timeDiffMs = currentDate - gameSession.lastActive;
            const timeDiffMin = timeDiffMs / (1000 * 60);
            if (timeDiffMin > GAME_SESSION_INACTIVE_THRESHOLD) {
                inactiveSessions++;
                await gameSessions[guildID].endSession(
                    "Inactive game session",
                    false,
                );
            }
        }),
    );

    if (inactiveSessions > 0) {
        logger.info(
            `Ended ${inactiveSessions} inactive game sessions out of ${totalSessions}`,
        );
    }
}

/** Cleans up inactive ListeningSessions */
export async function cleanupInactiveListeningSessions(): Promise<void> {
    const { listeningSessions } = State;
    let inactiveSessions = 0;
    const totalSessions = Object.keys(listeningSessions).length;
    await Promise.allSettled(
        Object.keys(listeningSessions).map(async (guildID) => {
            const listeningSession = listeningSessions[guildID];
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
        .selectFrom("app_kpop_group")
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
 * @param rawGroupNames - List of user-inputted group names
 * @param aliasApplied - Whether aliases have been applied
 * @returns a list of recognized/unrecognized groups
 */
export async function getMatchingGroupNames(
    rawGroupNames: Array<string>,
    aliasApplied = false,
): Promise<GroupMatchResults> {
    const artistIds = (
        await dbContext.kpopVideos
            .selectFrom("app_kpop_group")
            .select(["id"])
            .where("name", "in", rawGroupNames)
            .where("is_collab", "=", "n")
            .where("has_songs", "=", 1)
            .execute()
    ).map((x) => x.id);

    const matchingGroups = (
        await dbContext.kpopVideos // collab matches
            .selectFrom("app_kpop_agrelation")
            .innerJoin(
                "app_kpop_group",
                "app_kpop_agrelation.id_subgroup",
                "app_kpop_group.id",
            )
            .select(["id", "name"])
            .where("app_kpop_agrelation.id_artist", "in", artistIds)
            .where("app_kpop_group.is_collab", "=", "y")
            // artist matches
            .unionAll(
                dbContext.kpopVideos
                    .selectFrom("app_kpop_group")
                    .select(["id", "name"])
                    .where("app_kpop_group.id", "in", artistIds),
            )
            .orderBy("name", "asc")
            .execute()
    ).map((x) => ({ id: x.id, name: x.name }));

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
            const groupName = result.unmatchedGroups[i];
            const matchingAlias = Object.entries(State.aliases.artist).find(
                (artistAliasTuple) =>
                    artistAliasTuple[1]
                        .map((x) => cleanArtistName(x))
                        .includes(cleanArtistName(groupName)),
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
            clean_song_name_en: string;
            clean_song_name_ko: string;
        }): string => {
            if (
                locale === LocaleType.KO &&
                results.clean_song_name_ko &&
                useHangul
            ) {
                return results.clean_song_name_ko;
            }

            return results.clean_song_name_en;
        };

        const songName = useHangul
            ? "clean_song_name_ko"
            : "clean_song_name_en";

        easyNames = (
            await dbContext.kmq
                .selectFrom("available_songs")
                .select(["clean_song_name_en", "clean_song_name_ko"])
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
                            .select([
                                "clean_song_name_en",
                                "clean_song_name_ko",
                            ])
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
                            .select([
                                "clean_song_name_en",
                                "clean_song_name_ko",
                            ])
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
                        .select(["clean_song_name_en", "clean_song_name_ko"])
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
            if (uniqueResult.has(normalizePunctuationInName(song))) {
                removedResults.push(song);
                continue;
            }

            uniqueResult.set(normalizePunctuationInName(song), song);
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
 * @param song - The song to retrieve the name from
 * @param locale - The guild's locale
 * @param original - Whether to return the original song name
 * @returns the song name in Hangul if the server is using the Korean locale and the song has a Hangul name;
 * the original song name otherwise
 */
export function getLocalizedSongName(
    song: QueriedSong,
    locale: LocaleType,
    original = true,
): string {
    const songName = original ? song.originalSongName : song.songName;
    if (locale !== LocaleType.KO) {
        return songName;
    }

    const hangulSongName = original
        ? song.originalHangulSongName
        : song.hangulSongName;

    return hangulSongName || songName;
}

/**
 * @param song - The song to retrieve the artist from
 * @param locale - The guild's locale
 * @returns the artist's name in Hangul if the server is using the Korean locale and the artist has a Hangul name;
 * the artist's name otherwise
 */
export function getLocalizedArtistName(
    song: { artistName: string; hangulArtistName: string | null },
    locale: LocaleType,
): string {
    if (locale !== LocaleType.KO) {
        return song.artistName;
    }

    return song.hangulArtistName || song.artistName;
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

/**
 * @param guesser - The user to retrieve the time to guess for
 * @param round - The finished game round
 * @param gameType - The game type
 * @returns the milliseconds it took for a player to enter their guess
 */
export function getTimeToGuessMs(
    guesser: { id: string },
    round: GameRound,
    gameType: GameType,
): number {
    const correctGuessTimes = round
        .getGuesses()
        [guesser.id].filter((x) => x.correct)
        .map((x) => x.timeToGuessMs);

    if (gameType === GameType.HIDDEN) {
        // Use the most recent guess time for hidden games, since they can be overwritten
        return Math.max(...correctGuessTimes);
    }

    // Use the fastest guess time for normal games
    return Math.min(...correctGuessTimes);
}
