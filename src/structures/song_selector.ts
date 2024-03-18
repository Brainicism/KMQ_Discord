import {
    CHRONOLOGICAL_SHUFFLE_NUM_PARTITIONS,
    FOREIGN_LANGUAGE_TAGS,
    NON_OFFICIAL_VIDEO_TAGS,
    SELECTION_WEIGHT_VALUES_EASY,
    SELECTION_WEIGHT_VALUES_HARD,
    SHADOW_BANNED_ARTIST_IDS,
} from "../constants";
import { IPCLogger } from "../logger";
import {
    chooseWeightedRandom,
    parseKmqPlaylistIdentifier,
    setDifference,
    shufflePartitionedArray,
} from "../helpers/utils";
import ArtistType from "../enums/option_types/artist_type";
import GameRound from "./game_round";
import LanguageType from "../enums/option_types/language_type";
import OstPreference from "../enums/option_types/ost_preference";
import QueriedSong from "./queried_song";
import ReleaseType from "../enums/option_types/release_type";
import ShuffleType from "../enums/option_types/shuffle_type";
import State from "../state";
import SubunitsPreference from "../enums/option_types/subunit_preference";
import dbContext from "../database_context";
import type {
    AvailableGenders,
    GenderModeOptions,
} from "../enums/option_types/gender";
import type { Expression, SqlBool } from "kysely";
import type { MatchedPlaylist } from "../interfaces/matched_playlist";
import type Eris from "eris";
import type GuildPreference from "./guild_preference";
import type MessageContext from "./message_context";
import type UniqueSongCounter from "../interfaces/unique_song_counter";

const logger = new IPCLogger("song_selector");

interface SelectedSongs {
    songs: Set<QueriedSong>;
    countBeforeLimit: number;
    ineligibleDueToCommonAlias?: number;
}

export default class SongSelector {
    /** List of songs matching the user's game options */
    public selectedSongs: SelectedSongs | null;

    public static QueriedSongFields = [
        "available_songs.song_name_en as songName",
        "available_songs.song_name_ko as hangulSongName",
        "available_songs.artist_name_en as artistName",
        "available_songs.artist_name_ko as hangulArtistName",
        "available_songs.link as youtubeLink",
        "available_songs.original_link as originalLink",
        "available_songs.publishedon as publishDate",
        "available_songs.members",
        "available_songs.id_artist as artistID",
        "available_songs.issolo as isSolo",
        "available_songs.tags",
        "available_songs.views",
        "available_songs.vtype",
    ] as const;

    /** List of songs played with /shuffle unique enabled */
    public uniqueSongsPlayed: Set<string>;

    /** The last gender played when gender is set to alternating, can be null (in not alternating mode), GENDER.MALE, or GENDER.FEMALE */
    public lastAlternatingGender: GenderModeOptions | null;

    /** The shadowbanned artists */
    public shadowBannedArtists: Array<number> = [];

    /** The guild preference */
    private guildPreference: GuildPreference;

    constructor(guildPreference: GuildPreference) {
        this.selectedSongs = null;
        this.uniqueSongsPlayed = new Set();
        this.lastAlternatingGender = null;
        this.guildPreference = guildPreference;
        this.shadowBannedArtists = SHADOW_BANNED_ARTIST_IDS;
    }

    getUniqueSongCounter(): UniqueSongCounter {
        if (!this.selectedSongs) {
            return {
                uniqueSongsPlayed: 0,
                totalSongs: 0,
            };
        }

        const selectedSongs = new Set(
            [...this.selectedSongs.songs].map((x) => x.youtubeLink),
        );

        return {
            uniqueSongsPlayed:
                this.uniqueSongsPlayed.size -
                setDifference([...this.uniqueSongsPlayed], [...selectedSongs])
                    .size,
            totalSongs: Math.min(
                this.selectedSongs.countBeforeLimit,
                this.guildPreference.gameOptions.limitEnd -
                    this.guildPreference.gameOptions.limitStart,
            ),
        };
    }

    checkUniqueSongQueue(): boolean {
        const selectedSongs = this.getSongs().songs;
        const selectedSongLinks = new Set(
            [...selectedSongs].map((x) => x.youtubeLink),
        );

        if (
            setDifference([...selectedSongLinks], [...this.uniqueSongsPlayed])
                .size === 0
        ) {
            this.resetUniqueSongs();
            return true;
        }

        return false;
    }

    resetSessionState(): void {
        this.uniqueSongsPlayed = new Set();
        this.lastAlternatingGender = null;
    }

    checkAlternatingGender(): void {
        if (this.guildPreference.isGenderAlternating()) {
            if (this.lastAlternatingGender === null) {
                this.lastAlternatingGender =
                    Math.random() < 0.5 ? "male" : "female";
            } else {
                this.lastAlternatingGender =
                    this.lastAlternatingGender === "male" ? "female" : "male";
            }
        } else {
            this.lastAlternatingGender = null;
        }
    }

    queryRandomSong(): QueriedSong | null {
        let randomSong: QueriedSong | null;
        const ignoredSongs = new Set([...this.uniqueSongsPlayed]);

        if (this.lastAlternatingGender) {
            randomSong = this.selectRandomSong(
                ignoredSongs,
                this.lastAlternatingGender,
                this.guildPreference.gameOptions.shuffleType,
            );
        } else {
            randomSong = this.selectRandomSong(
                ignoredSongs,
                null,
                this.guildPreference.gameOptions.shuffleType,
            );
        }

        if (randomSong === null) {
            return null;
        }

        this.uniqueSongsPlayed.add(randomSong.youtubeLink);

        return randomSong;
    }

    /**
     * Selects a random song based on the GameOptions, avoiding recently played songs
     * @param ignoredSongs - The union of last played songs and unique songs to not select from
     * @param alternatingGender - The gender to limit selecting from if /gender alternating
     * @param shuffleType - The shuffle type
     * @returns the QueriedSong
     */
    selectRandomSong(
        ignoredSongs: Set<string>,
        alternatingGender: GenderModeOptions | null,
        shuffleType = ShuffleType.RANDOM,
    ): QueriedSong | null {
        let queriedSongList = [...this.getSongs().songs];
        if (ignoredSongs) {
            queriedSongList = queriedSongList.filter(
                (x) => !ignoredSongs.has(x.youtubeLink),
            );
        }

        if (
            alternatingGender &&
            queriedSongList.some(
                (y) => y.members === alternatingGender || y.members === "coed",
            )
        ) {
            queriedSongList = queriedSongList.filter(
                (song) =>
                    song.members === alternatingGender ||
                    song.members === "coed",
            );
        }

        if (queriedSongList.length === 0) {
            return null;
        }

        switch (shuffleType) {
            case ShuffleType.POPULARITY:
            case ShuffleType.CHRONOLOGICAL:
            case ShuffleType.REVERSE_CHRONOLOGICAL:
                return queriedSongList[0];
            case ShuffleType.WEIGHTED_EASY:
            case ShuffleType.WEIGHTED_HARD:
                return chooseWeightedRandom(queriedSongList, "selectionWeight");
            case ShuffleType.RANDOM:
                return queriedSongList[
                    Math.floor(Math.random() * queriedSongList.length)
                ];
            default:
                logger.error(`Unexpected ShuffleType: ${shuffleType}`);
                return queriedSongList[
                    Math.floor(Math.random() * queriedSongList.length)
                ];
        }
    }

    /**
     * Resets the unique songs set
     */
    resetUniqueSongs(): void {
        this.uniqueSongsPlayed.clear();
    }

    getSongs(): SelectedSongs {
        if (!this.selectedSongs) {
            return {
                songs: new Set(),
                countBeforeLimit: 0,
            };
        }

        return this.selectedSongs;
    }

    getCurrentSongCount(): number {
        return this.selectedSongs ? this.selectedSongs.songs.size : 0;
    }

    setShadowBannedArtists(shadowBannedArtists: Array<number>): void {
        this.shadowBannedArtists = shadowBannedArtists;
    }

    async reloadSongs(
        kmqPlaylistIdentifier?: string,
        forceRefreshMetadata?: boolean,
        messageContext?: MessageContext,
        interaction?: Eris.CommandInteraction,
    ): Promise<MatchedPlaylist | null> {
        if (
            !kmqPlaylistIdentifier ||
            this.guildPreference.gameOptions.forcePlaySongID
        ) {
            this.selectedSongs = await this.querySelectedSongs();

            return null;
        }

        const playlist = await this.getPlaylistSongList(
            kmqPlaylistIdentifier,
            forceRefreshMetadata || false,
            messageContext,
            interaction!,
        );

        this.selectedSongs = playlist as SelectedSongs;
        return playlist;
    }

    async getPlaylistSongList(
        kmqPlaylistIdentifier: string,
        forceRefreshMetadata: boolean,
        messageContext?: MessageContext,
        interaction?: Eris.CommandInteraction,
    ): Promise<SelectedSongs & MatchedPlaylist> {
        const guildID = this.guildPreference.guildID;
        const kmqPlaylistParsed = parseKmqPlaylistIdentifier(
            kmqPlaylistIdentifier,
        );

        const { matchedSongs, metadata, truncated, unmatchedSongs } =
            kmqPlaylistParsed.isSpotify
                ? await State.playlistManager.getMatchedSpotifyPlaylist(
                      guildID,
                      kmqPlaylistParsed.playlistId,
                      forceRefreshMetadata,
                      messageContext,
                      interaction,
                  )
                : await State.playlistManager.getMatchedYoutubePlaylist(
                      guildID,
                      kmqPlaylistParsed.playlistId,
                      forceRefreshMetadata,
                      messageContext,
                      interaction,
                  );

        const result = new Set(matchedSongs);

        // map matched songs to list of aliases, then normalize/deduplicate to check for repeated song names
        const songAliasByMatchedSong = matchedSongs.map((song) => {
            const allNamesAndAliases = [
                song.songName,
                ...(song.hangulSongName ? [song.hangulSongName] : []),
                ...(State.aliases.song[song.youtubeLink] || []),
            ];

            const normalizedDeduped = new Set(
                allNamesAndAliases.map((name) =>
                    GameRound.normalizePunctuationInName(name),
                ),
            );

            return Array.from(normalizedDeduped);
        });

        const aliasToCountMapping: { [alias: string]: number } = {};
        for (const dedupedAliasesForSong of songAliasByMatchedSong) {
            for (const dedupedAlias of dedupedAliasesForSong) {
                if (!(dedupedAlias in aliasToCountMapping)) {
                    aliasToCountMapping[dedupedAlias] = 1;
                    continue;
                }

                aliasToCountMapping[dedupedAlias]++;
            }
        }

        let ineligibleDueToCommonAlias = 0;
        for (const alias in aliasToCountMapping) {
            if (aliasToCountMapping[alias] > 10) {
                ineligibleDueToCommonAlias += aliasToCountMapping[alias] - 1;
            }
        }

        if (ineligibleDueToCommonAlias) {
            logger.info(
                `gid: ${guildID}, pid: ${kmqPlaylistIdentifier} | Some songs were ineligible due to common aliases: ${JSON.stringify(aliasToCountMapping)}`,
            );
        }

        return {
            songs: result,
            countBeforeLimit: result.size,
            matchedSongs,
            metadata,
            truncated,
            unmatchedSongs,
            ineligibleDueToCommonAlias,
        };
    }

    /**
     * Returns a list of songs from the data store, narrowed down by the specified game options
     * @returns a list of songs, as well as the number of songs before the filter option was applied
     */
    private async querySelectedSongs(): Promise<{
        songs: Set<QueriedSong>;
        countBeforeLimit: number;
    }> {
        const gameOptions = this.guildPreference.gameOptions;
        let result: Array<QueriedSong> = [];
        let queryBuilder = dbContext.kmq
            .selectFrom("available_songs")
            .select(SongSelector.QueriedSongFields);

        if (gameOptions.forcePlaySongID) {
            queryBuilder = queryBuilder.where(
                "link",
                "=",
                gameOptions.forcePlaySongID,
            );
            return {
                songs: new Set(
                    (await queryBuilder.execute()).map(
                        (x) => new QueriedSong(x),
                    ),
                ),
                countBeforeLimit: 1,
            };
        }

        let subunits: Array<number> = [];
        let collabGroupContainingSubunit: Array<number> = [];
        const selectedGroupIDs = this.guildPreference.getGroupIDs();
        if (gameOptions.subunitPreference === SubunitsPreference.INCLUDE) {
            let subunitsQueryBuilder = dbContext.kpopVideos
                .selectFrom("app_kpop_group")
                .select("id");

            subunitsQueryBuilder = subunitsQueryBuilder.where(
                "id_parentgroup",
                "in",
                selectedGroupIDs,
            );

            subunitsQueryBuilder = subunitsQueryBuilder.where(
                "id",
                "not in",
                this.shadowBannedArtists,
            );

            subunits = (await subunitsQueryBuilder.execute()).map(
                (x) => x["id"],
            );

            if (subunits.length) {
                let collabGroupBuilder = dbContext.kpopVideos // collab matches
                    .selectFrom("app_kpop_agrelation")
                    .innerJoin(
                        "app_kpop_group",
                        "app_kpop_agrelation.id_subgroup",
                        "app_kpop_group.id",
                    )
                    .select(["id", "name"])
                    .distinct()
                    .where("app_kpop_group.is_collab", "=", "y");

                collabGroupBuilder = collabGroupBuilder.where(
                    "app_kpop_agrelation.id_artist",
                    "in",
                    subunits,
                );

                collabGroupContainingSubunit = (
                    await collabGroupBuilder.execute()
                ).map((x) => x["id"]);
            }
        }

        queryBuilder = queryBuilder.where(({ or, eb, and }) => {
            const includesInnerArtistFilterExpressions: Array<
                Expression<SqlBool>
            > = [];

            const includesGroupIDs = this.guildPreference.getIncludesGroupIDs();
            if (includesGroupIDs.length) {
                if (!this.guildPreference.isGroupsMode()) {
                    if (
                        gameOptions.subunitPreference ===
                        SubunitsPreference.EXCLUDE
                    ) {
                        includesInnerArtistFilterExpressions.push(
                            eb("id_artist", "in", includesGroupIDs),
                        );
                    } else {
                        includesInnerArtistFilterExpressions.push(
                            or([
                                eb("id_artist", "in", includesGroupIDs),
                                eb("id_parent_artist", "in", includesGroupIDs),
                            ]),
                        );
                    }
                }
            }

            const mainArtistFilterExpressions: Array<Expression<SqlBool>> = [];

            mainArtistFilterExpressions.push(
                eb(
                    "id_artist",
                    "not in",
                    this.guildPreference.getExcludesGroupIDs(),
                ),
            );

            if (!this.guildPreference.isGroupsMode()) {
                const gender: Array<AvailableGenders> =
                    this.guildPreference.isGenderAlternating()
                        ? ["male", "female", "coed"]
                        : (gameOptions.gender as Array<AvailableGenders>);

                mainArtistFilterExpressions.push(eb("members", "in", gender));
                // filter by artist type only in non-groups
                if (gameOptions.artistType !== ArtistType.BOTH) {
                    mainArtistFilterExpressions.push(
                        eb(
                            "issolo",
                            "=",
                            gameOptions.artistType === ArtistType.SOLOIST
                                ? "y"
                                : "n",
                        ),
                    );
                }
            } else if (
                gameOptions.subunitPreference === SubunitsPreference.EXCLUDE
            ) {
                mainArtistFilterExpressions.push(
                    eb("id_artist", "in", selectedGroupIDs),
                );
            } else {
                const mainArtistIdSearchExpressions = [];
                mainArtistIdSearchExpressions.push(
                    ...[
                        eb("id_artist", "in", selectedGroupIDs),
                        eb("id_parent_artist", "in", selectedGroupIDs),
                    ],
                );

                mainArtistIdSearchExpressions.push(
                    eb("id_artist", "in", collabGroupContainingSubunit),
                );

                mainArtistFilterExpressions.push(
                    and([
                        eb("id_artist", "not in", this.shadowBannedArtists),
                        or(mainArtistIdSearchExpressions),
                    ]),
                );
            }

            // Kyseley does not like it when you provide an empty array or array of size 1 to OR/AND
            const finalExpressions = [];
            if (includesInnerArtistFilterExpressions.length === 1) {
                finalExpressions.push(includesInnerArtistFilterExpressions[0]);
            } else if (includesInnerArtistFilterExpressions.length > 1) {
                finalExpressions.push(
                    and(includesInnerArtistFilterExpressions),
                );
            }

            if (mainArtistFilterExpressions.length === 1) {
                finalExpressions.push(mainArtistFilterExpressions[0]);
            } else if (mainArtistFilterExpressions.length > 1) {
                finalExpressions.push(and(mainArtistFilterExpressions));
            }

            return or(finalExpressions);
        });

        if (gameOptions.languageType === LanguageType.KOREAN) {
            for (const tag of FOREIGN_LANGUAGE_TAGS) {
                queryBuilder = queryBuilder.where(
                    "tags",
                    "not like",
                    `%${tag}%`,
                );
            }
        }

        if (gameOptions.ostPreference === OstPreference.EXCLUDE) {
            queryBuilder = queryBuilder.where("tags", "not like", "%o%");
        } else if (gameOptions.ostPreference === OstPreference.EXCLUSIVE) {
            queryBuilder = queryBuilder.where("tags", "like", "%o%");
        }

        // exclude remixes
        queryBuilder = queryBuilder.where("tags", "not like", "%x%");

        if (gameOptions.releaseType === ReleaseType.OFFICIAL) {
            queryBuilder = queryBuilder.where("vtype", "=", "main");
            for (const tag of NON_OFFICIAL_VIDEO_TAGS) {
                queryBuilder = queryBuilder.where(
                    "tags",
                    "not like",
                    `%${tag}%`,
                );
            }
        }

        queryBuilder = queryBuilder
            .where(
                "publishedon",
                ">=",
                new Date(`${gameOptions.beginningYear}-01-01`),
            )
            .where(
                "publishedon",
                "<=",
                new Date(`${gameOptions.endYear}-12-31`),
            );

        const shuffleType = gameOptions.shuffleType;
        if (
            [
                ShuffleType.CHRONOLOGICAL,
                ShuffleType.REVERSE_CHRONOLOGICAL,
            ].includes(shuffleType)
        ) {
            queryBuilder = queryBuilder.orderBy(
                "publishedon",
                shuffleType === ShuffleType.CHRONOLOGICAL ? "asc" : "desc",
            );
        } else {
            queryBuilder = queryBuilder.orderBy("views", "desc");
        }

        result = (await queryBuilder.execute()).map((x) => new QueriedSong(x));

        const count = result.length;
        result = result.slice(gameOptions.limitStart, gameOptions.limitEnd);
        let selectionWeightValues: Array<number> = [1];

        switch (shuffleType) {
            case ShuffleType.WEIGHTED_EASY:
                selectionWeightValues = SELECTION_WEIGHT_VALUES_EASY;
                break;
            case ShuffleType.WEIGHTED_HARD:
                selectionWeightValues = SELECTION_WEIGHT_VALUES_HARD;
                break;
            case ShuffleType.CHRONOLOGICAL:
            case ShuffleType.REVERSE_CHRONOLOGICAL:
                if (result.length > CHRONOLOGICAL_SHUFFLE_NUM_PARTITIONS * 2) {
                    // shuffle songs within each partitions
                    result = shufflePartitionedArray(
                        result,
                        CHRONOLOGICAL_SHUFFLE_NUM_PARTITIONS,
                    );
                }

                break;
            default:
                break;
        }

        result = result
            .map((song, index) => ({
                ...song,
                selectionWeight:
                    selectionWeightValues[
                        Math.floor(
                            (index / result.length) *
                                selectionWeightValues.length,
                        )
                    ],
            }))
            .map((x) => new QueriedSong(x));

        return {
            songs: new Set(result),
            countBeforeLimit: count,
        };
    }
}
