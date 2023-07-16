import { IPCLogger } from "../logger";
import {
    PATREON_SUPPORTER_BADGE_ID,
    SHADOW_BANNED_ARTIST_IDS,
} from "../constants";
import {
    cleanArtistName,
    normalizePunctuationInName,
} from "../structures/game_round";
import { containsHangul, md5Hash } from "./utils";
import { sql } from "kysely";
import AnswerType from "../enums/option_types/answer_type";
import GuessModeType from "../enums/option_types/guess_mode_type";
import LocaleType from "../enums/locale_type";
import SongSelector from "../structures/song_selector";
import State from "../state";
import _ from "lodash";
import dbContext from "../database_context";
import type { AvailableGenders } from "../enums/option_types/gender";
import type { MatchedPlaylist } from "../interfaces/matched_playlist";
import type Eris from "eris";
import type GuildPreference from "../structures/guild_preference";
import type MatchedArtist from "../interfaces/matched_artist";
import type MessageContext from "../structures/message_context";
import type Patron from "../interfaces/patron";
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
 * @param isPremium - Whether to include premium songs
 * @param messageContext - The message which triggered the song count check
 * @param interaction - The interaction that triggered the song count check
 * @returns an object containing the total number of available songs before and after limit based on the GameOptions
 */
export async function getAvailableSongCount(
    guildPreference: GuildPreference,
    isPremium: boolean,
    messageContext?: MessageContext,
    interaction?: Eris.CommandInteraction
): Promise<{
    count: number | undefined;
    countBeforeLimit: number | undefined;
}> {
    try {
        if (guildPreference.isSpotifyPlaylist()) {
            const playlistID = guildPreference.getSpotifyPlaylistID()!;
            const session =
                State.gameSessions[guildPreference.guildID] ??
                State.listeningSessions[guildPreference.guildID];

            let matchedPlaylist: MatchedPlaylist;
            if (session) {
                matchedPlaylist = (await session.songSelector.reloadSongs(
                    guildPreference,
                    isPremium,
                    playlistID,
                    !session.sessionInitialized,
                    messageContext,
                    interaction
                )) as MatchedPlaylist;
            } else {
                matchedPlaylist = (await new SongSelector().reloadSongs(
                    guildPreference,
                    isPremium,
                    playlistID,
                    false,
                    messageContext,
                    interaction
                )) as MatchedPlaylist;
            }

            return {
                count: matchedPlaylist.metadata.matchedSongsLength,
                countBeforeLimit: matchedPlaylist.metadata.matchedSongsLength,
            };
        }

        const { songs, countBeforeLimit } =
            await SongSelector.getFilteredSongList(
                guildPreference,
                isPremium,
                SHADOW_BANNED_ARTIST_IDS
            );

        return {
            count: songs.size,
            countBeforeLimit,
        };
    } catch (e) {
        logger.error(
            `gid: ${guildPreference.guildID} | Error retrieving song count ${e.stack}`
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
                await gameSessions[guildID].endSession("Inactive game session");
            }
        })
    );

    if (inactiveSessions > 0) {
        logger.info(
            `Ended ${inactiveSessions} inactive game sessions out of ${totalSessions}`
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
    locale: LocaleType
): Promise<Array<string>> {
    const similarGroups = await dbContext.kpopVideos
        .selectFrom("app_kpop_group")
        .select(["id", "name", "kname"])
        .where(({ or, cmpr }) =>
            or([
                cmpr("name", "like", `%${groupName}%`),
                cmpr("kname", "like", `%${groupName}%`),
            ])
        )
        .orderBy((eb) => eb.fn("CHAR_LENGTH", ["name"]), "asc")
        .limit(5)
        .execute();

    if (similarGroups.length === 0) return [];
    return similarGroups.map((x) =>
        locale !== LocaleType.KO ? x["name"] : x["kname"] || x["name"]
    );
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
    const artistIds = (
        await dbContext.kpopVideos
            .selectFrom("app_kpop_group")
            .select(["id"])
            .where("name", "in", rawGroupNames)
            .execute()
    ).map((x) => x.id);

    const matchingGroups = (
        await dbContext.kpopVideos // collab matches
            .selectFrom("app_kpop_agrelation")
            .innerJoin(
                "app_kpop_group",
                "app_kpop_agrelation.id_subgroup",
                "app_kpop_group.id"
            )
            .select(["id", "name"])
            .where("app_kpop_agrelation.id_artist", "in", artistIds)
            .where("app_kpop_group.is_collab", "=", "y")
            // artist matches
            .unionAll(
                dbContext.kpopVideos
                    .selectFrom("app_kpop_group")
                    .select(["id", "name"])
                    .where("app_kpop_group.id", "in", artistIds)
            )
            .orderBy("name", "asc")
            .execute()
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
            const matchingAlias = Object.entries(State.aliases.artist).find(
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
 * @param locale - The server's locale
 * @returns unshuffled incorrect choices based on difficulty
 */
export async function getMultipleChoiceOptions(
    answerType: AnswerType,
    guessMode: GuessModeType,
    gender: AvailableGenders,
    answer: string,
    artistID: number,
    locale: LocaleType
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
                    MEDIUM_SAME_ARTIST_CHOICES
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
                    MEDIUM_CHOICES - MEDIUM_SAME_ARTIST_CHOICES
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
                numChoices - result.length
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
 * @param userIDs - A list of user IDs to check
 * @returns whether at least one player has premium status
 */
export async function areUsersPremium(
    userIDs: Array<string>
): Promise<boolean> {
    return !!(await dbContext.kmq
        .selectFrom("premium_users")
        .selectAll()
        .where("active", "=", 1)
        .where("user_id", "in", userIDs)
        .executeTakeFirst());
}

/**
 * @param userID - The user ID
 * @returns whether the player has premium status
 */
export async function isUserPremium(userID: string): Promise<boolean> {
    return areUsersPremium([userID]);
}

/**
 * @param activePatrons - The users to grant premium membership
 * @param inactiveUserIDs - The users to revoke premium membership from
 */
export async function updatePremium(
    activePatrons: Array<Patron>,
    inactiveUserIDs: string[]
): Promise<void> {
    // Grant premium
    const activePatronsPayload = activePatrons.map((x) => ({
        active: x.activePatron ? 1 : 0,
        first_subscribed: x.firstSubscribed,
        user_id: x.discordID,
        source: "patreon" as const,
    }));

    await Promise.all(
        activePatronsPayload.map(async (activePatronPayload) => {
            await dbContext.kmq
                .insertInto("premium_users")
                .values(activePatronPayload)
                .onDuplicateKeyUpdate(activePatronPayload)
                .execute();
        })
    );

    const payload = activePatrons.map((x) => ({
        user_id: x.discordID,
        badge_id: PATREON_SUPPORTER_BADGE_ID,
    }));

    await dbContext.kmq
        .insertInto("badges_players")
        .values(payload)
        .ignore()
        .execute();

    // Revoke premium
    await dbContext.kmq
        .updateTable("premium_users")
        .where("user_id", "in", inactiveUserIDs)
        .set({ active: 0 })
        .execute();

    await dbContext.kmq
        .deleteFrom("badges_players")
        .where("user_id", "in", inactiveUserIDs)
        .where("badge_id", "=", PATREON_SUPPORTER_BADGE_ID)
        .execute();
}

/**
 * @param session - The session
 * @param playerID - The player ID
 * @returns whether the current game is a premium game/listening session, or the player is premium
 */
export async function isPremiumRequest(
    session: Session,
    playerID: string
): Promise<boolean> {
    return session?.isPremium || (await isUserPremium(playerID));
}

/**
 * @param userID - The user's ID
 * @returns whether this is the user's first game played today
 */
export async function isFirstGameOfDay(userID: string): Promise<boolean> {
    const player = await dbContext.kmq
        .selectFrom("player_stats")
        .select(
            sql<number>`DAYOFYEAR(last_active) = DAYOFYEAR(CURDATE())`.as(
                "firstGameOfDay"
            )
        )
        .where("player_id", "=", userID)
        .executeTakeFirst();

    if (!player) return true;
    return player["firstGameOfDay"] === 0;
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
    original = true
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
    locale: LocaleType
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
        (powerHour) => currentHour >= powerHour && currentHour <= powerHour + 1
    );
}
