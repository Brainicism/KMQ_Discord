import { execSync } from "child_process";
import _ from "lodash";

import { AnswerType } from "../commands/game_options/answer";
import { Gender } from "../commands/game_options/gender";
import { GuessModeType } from "../commands/game_options/guessmode";
import dbContext from "../database_context";
import { state } from "../kmq_worker";
import { IPCLogger } from "../logger";
import { cleanArtistName, cleanSongName } from "../structures/game_round";
import GuildPreference from "../structures/guild_preference";
import Session from "../structures/session";
import SongSelector from "../structures/song_selector";
import { MatchedArtist, QueriedSong } from "../types";
import { LocaleType } from "./localization_manager";
import { containsHangul, md5Hash } from "./utils";

const GAME_SESSION_INACTIVE_THRESHOLD = 30;

const logger = new IPCLogger("game_utils");

interface GroupMatchResults {
    unmatchedGroups: Array<string>;
    matchedGroups?: Array<MatchedArtist>;
}

/**
 * Joins the VoiceChannel specified by GameSession, and stores the VoiceConnection
 * @param session - The active Session
 */
export async function ensureVoiceConnection(session: Session): Promise<void> {
    const { client } = state;
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
        .kmq("guilds")
        .select("*")
        .where("guild_id", "=", guildID);

    if (guildPreferences.length === 0) {
        const guildPreference = GuildPreference.fromGuild(guildID);
        await dbContext
            .kmq("guilds")
            .insert({ guild_id: guildID, join_date: new Date() });
        return guildPreference;
    }

    const gameOptionPairs = (
        await dbContext
            .kmq("game_options")
            .select("*")
            .where({ client_id: process.env.BOT_CLIENT_ID, guild_id: guildID })
    )
        .map((x) => ({ [x["option_name"]]: JSON.parse(x["option_value"]) }))
        .reduce((total, curr) => Object.assign(total, curr), {});

    return GuildPreference.fromGuild(
        guildPreferences[0].guild_id,
        gameOptionPairs
    );
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
        .kpopVideos("app_kpop_group")
        .select(["id"])
        .whereIn("name", rawGroupNames);

    const matchingGroups = (
        await dbContext
            .kpopVideos("app_kpop_group")
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
        matchedGroups: matchingGroups,
        unmatchedGroups: unrecognizedGroups,
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
 * @param locale - The server's locale
 * @returns unshuffled incorrect choices based on difficulty
 */
export async function getMultipleChoiceOptions(
    answerType: AnswerType,
    guessMode: GuessModeType,
    gender: Gender,
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
            await dbContext
                .kmq("available_songs")
                .select("clean_song_name_en", "clean_song_name_ko")
                .groupByRaw(`UPPER(${songName})`)
                .where("members", gender)
                .andWhereRaw(`NOT UPPER(${songName}) = ?`, [
                    answer.toUpperCase(),
                ])
                .andWhereNot("id_artist", artistID)
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
                        await dbContext
                            .kmq("available_songs")
                            .select("clean_song_name_en", "clean_song_name_ko")
                            .groupByRaw(`UPPER(${songName})`)
                            .where("id_artist", artistID)
                            .andWhereRaw(`NOT UPPER(${songName}) = ?`, [
                                answer.toUpperCase(),
                            ])
                    ).map((x) => pickNonEmpty(x)),
                    MEDIUM_SAME_ARTIST_CHOICES
                );

                const sameGenderSongs = _.sampleSize(
                    (
                        await dbContext
                            .kmq("available_songs")
                            .select("clean_song_name_en", "clean_song_name_ko")
                            .groupByRaw(`UPPER(${songName})`)
                            .where("members", gender)
                            .andWhereRaw(`UPPER(${songName}) NOT IN (?)`, [
                                [...sameArtistSongs, answer].map((x) =>
                                    x.toUpperCase()
                                ),
                            ])
                            .andWhereNot("id_artist", artistID)
                    ).map((x) => pickNonEmpty(x)),
                    MEDIUM_CHOICES - MEDIUM_SAME_ARTIST_CHOICES
                );

                result = [...sameArtistSongs, ...sameGenderSongs];
                break;
            }

            case AnswerType.MULTIPLE_CHOICE_HARD: {
                // Hard: HARD_CHOICES from chosen artist
                names = (
                    await dbContext
                        .kmq("available_songs")
                        .select("clean_song_name_en", "clean_song_name_ko")
                        .groupByRaw(`UPPER(${songName})`)
                        .where("id_artist", artistID)
                        .andWhereRaw(`NOT UPPER(${songName}) = ?`, [
                            answer.toUpperCase(),
                        ])
                ).map((x) => pickNonEmpty(x));
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
        const pickNonEmpty = (results: {
            artist_name_en: string;
            artist_name_ko: string;
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
            await dbContext
                .kmq("available_songs")
                .select("artist_name_en", "artist_name_ko")
                .whereNot(artistName, answer)
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
                    await dbContext
                        .kmq("available_songs")
                        .select("artist_name_en", "artist_name_ko")
                        .where("members", gender)
                        .andWhereNot(artistName, answer)
                ).map((x) => pickNonEmpty(x));
                result = _.sampleSize(names, CHOICES_BY_DIFFICULTY[answerType]);
                break;
            default:
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
    const player = await dbContext
        .kmq("player_stats")
        .select(
            dbContext.kmq.raw(
                "DAYOFYEAR(last_active) = DAYOFYEAR(CURDATE()) as firstGameOfDay"
            )
        )
        .where("player_id", "=", userID)
        .first();

    if (!player) return true;
    return player["firstGameOfDay"] === 0;
}

/**
 * @returns KMQ's current version
 */
export function getKmqCurrentVersion(): string {
    return execSync("git describe --tags").toString().trim();
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
    song: QueriedSong,
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

    // distribute between each third of the day to accomodate timezone differences
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
