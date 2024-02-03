import {
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
} from "../helpers/utils";
import { sql } from "kysely";
import ArtistType from "../enums/option_types/artist_type";
import LanguageType from "../enums/option_types/language_type";
import OstPreference from "../enums/option_types/ost_preference";
import ReleaseType from "../enums/option_types/release_type";
import RemixPreference from "../enums/option_types/remix_preference";
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
import type QueriedSong from "../interfaces/queried_song";
import type UniqueSongCounter from "../interfaces/unique_song_counter";

const logger = new IPCLogger("song_selector");

interface QueriedSongList {
    songs: Set<QueriedSong>;
    countBeforeLimit: number;
}

export default class SongSelector {
    /** List of songs matching the user's game options */
    public filteredSongs: {
        songs: Set<QueriedSong>;
        countBeforeLimit: number;
    } | null;

    public static QueriedSongFields = [
        "available_songs.clean_song_name_en as songName",
        "available_songs.song_name_en as originalSongName",
        "available_songs.clean_song_name_ko as hangulSongName",
        "available_songs.song_name_ko as originalHangulSongName",
        "available_songs.artist_name_en as artistName",
        "available_songs.artist_name_ko as hangulArtistName",
        "available_songs.link as youtubeLink",
        "available_songs.publishedon as publishDate",
        "available_songs.members",
        "available_songs.id_artist as artistID",
        "available_songs.issolo as isSolo",
        "available_songs.tags",
        "available_songs.views",
        "available_songs.rank",
        "available_songs.vtype",
    ] as const;

    /** List of songs played with /shuffle unique enabled */
    public uniqueSongsPlayed: Set<string>;

    /** The last gender played when gender is set to alternating, can be null (in not alternating mode), GENDER.MALE, or GENDER.FEMALE */
    public lastAlternatingGender: GenderModeOptions | null;

    constructor() {
        this.filteredSongs = null;
        this.uniqueSongsPlayed = new Set();
        this.lastAlternatingGender = null;
    }

    getUniqueSongCounter(guildPreference: GuildPreference): UniqueSongCounter {
        if (!this.filteredSongs) {
            return {
                uniqueSongsPlayed: 0,
                totalSongs: 0,
            };
        }

        const filteredSongs = new Set(
            [...this.filteredSongs.songs].map((x) => x.youtubeLink),
        );

        return {
            uniqueSongsPlayed:
                this.uniqueSongsPlayed.size -
                setDifference([...this.uniqueSongsPlayed], [...filteredSongs])
                    .size,
            totalSongs: Math.min(
                this.filteredSongs.countBeforeLimit,
                guildPreference.gameOptions.limitEnd -
                    guildPreference.gameOptions.limitStart,
            ),
        };
    }

    checkUniqueSongQueue(): boolean {
        const selectedSongs = this.getSongs().songs;
        const filteredSongs = new Set(
            [...selectedSongs].map((x) => x.youtubeLink),
        );

        if (
            setDifference([...filteredSongs], [...this.uniqueSongsPlayed])
                .size === 0
        ) {
            this.resetUniqueSongs();
            return true;
        }

        return false;
    }

    checkAlternatingGender(guildPreference: GuildPreference): void {
        if (guildPreference.isGenderAlternating()) {
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

    queryRandomSong(guildPreference: GuildPreference): QueriedSong | null {
        const selectedSongs = this.getSongs().songs;
        let randomSong: QueriedSong | null;
        const ignoredSongs = new Set([...this.uniqueSongsPlayed]);

        if (this.lastAlternatingGender) {
            randomSong = SongSelector.selectRandomSong(
                selectedSongs,
                ignoredSongs,
                this.lastAlternatingGender,
                guildPreference.gameOptions.shuffleType,
            );
        } else {
            randomSong = SongSelector.selectRandomSong(
                selectedSongs,
                ignoredSongs,
                null,
                guildPreference.gameOptions.shuffleType,
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
     * @param filteredSongs - The filtered songs to select from
     * @param ignoredSongs - The union of last played songs and unique songs to not select from
     * @param alternatingGender - The gender to limit selecting from if /gender alternating
     * @param shuffleType - The shuffle type
     * @returns the QueriedSong
     */
    static selectRandomSong(
        filteredSongs: Set<QueriedSong>,
        ignoredSongs: Set<string>,
        alternatingGender: GenderModeOptions | null,
        shuffleType = ShuffleType.RANDOM,
    ): QueriedSong | null {
        let queriedSongList = [...filteredSongs];
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

    getSongs(): { songs: Set<QueriedSong>; countBeforeLimit: number } {
        if (!this.filteredSongs) {
            return {
                songs: new Set(),
                countBeforeLimit: 0,
            };
        }

        return this.filteredSongs;
    }

    getCurrentSongCount(): number {
        return this.filteredSongs ? this.filteredSongs.songs.size : 0;
    }

    async reloadSongs(
        guildPreference: GuildPreference,
        kmqPlaylistIdentifier?: string,
        forceRefreshMetadata?: boolean,
        messageContext?: MessageContext,
        interaction?: Eris.CommandInteraction,
    ): Promise<MatchedPlaylist | null> {
        if (!kmqPlaylistIdentifier) {
            this.filteredSongs = await SongSelector.getFilteredSongList(
                guildPreference,
                SHADOW_BANNED_ARTIST_IDS,
            );

            return null;
        }

        const playlist = await SongSelector.getPlaylistSongList(
            guildPreference.guildID,
            kmqPlaylistIdentifier,
            forceRefreshMetadata || false,
            messageContext,
            interaction!,
        );

        this.filteredSongs = playlist as QueriedSongList;
        return playlist;
    }

    /**
     * Returns a list of songs from the data store, narrowed down by the specified game options
     * @param guildPreference - The GuildPreference
     * @param shadowBannedArtistIds - artist IDs that shouldn't be populated by subunit inclusion
     * @returns a list of songs, as well as the number of songs before the filter option was applied
     */
    static async getFilteredSongList(
        guildPreference: GuildPreference,
        shadowBannedArtistIds: Array<number> = [],
    ): Promise<{ songs: Set<QueriedSong>; countBeforeLimit: number }> {
        const gameOptions = guildPreference.gameOptions;
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
                songs: new Set(await queryBuilder.execute()),
                countBeforeLimit: 1,
            };
        }

        let subunits: Array<number> = [];
        let collabGroupContainingSubunit: Array<number> = [];
        const selectedGroupIDs = guildPreference.getGroupIDs();
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
                shadowBannedArtistIds,
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

            const includesGroupIDs = guildPreference.getIncludesGroupIDs();
            if (includesGroupIDs.length) {
                if (!guildPreference.isGroupsMode()) {
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
                    guildPreference.getExcludesGroupIDs(),
                ),
            );

            if (!guildPreference.isGroupsMode()) {
                const gender: Array<AvailableGenders> =
                    guildPreference.isGenderAlternating()
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
                        eb("id_artist", "not in", shadowBannedArtistIds),
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

        if (gameOptions.remixPreference === RemixPreference.EXCLUDE) {
            queryBuilder = queryBuilder.where("tags", "not like", "%x%");
        }

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
            queryBuilder = queryBuilder
                .orderBy(
                    sql`SUBSTRING(publishedon, 1, ${"YYYY-MM".length})`,
                    shuffleType === ShuffleType.CHRONOLOGICAL ? "asc" : "desc",
                )
                .orderBy(sql`RAND()`);
        } else {
            queryBuilder = queryBuilder.orderBy("views", "desc");
        }

        queryBuilder = queryBuilder.where(
            "rank",
            "<=",
            parseInt(process.env.AUDIO_SONGS_PER_ARTIST as string, 10),
        );

        result = await queryBuilder.execute();

        const count = result.length;
        result = result.slice(gameOptions.limitStart, gameOptions.limitEnd);
        let selectionWeightValues: Array<number>;

        switch (shuffleType) {
            case ShuffleType.WEIGHTED_EASY:
                selectionWeightValues = SELECTION_WEIGHT_VALUES_EASY;
                break;
            case ShuffleType.WEIGHTED_HARD:
                selectionWeightValues = SELECTION_WEIGHT_VALUES_HARD;
                break;
            default:
                selectionWeightValues = [1];
                break;
        }

        result = result.map((song, index) => ({
            ...song,
            selectionWeight:
                selectionWeightValues[
                    Math.floor(
                        (index / result.length) * selectionWeightValues.length,
                    )
                ],
        }));

        return {
            songs: new Set(result),
            countBeforeLimit: count,
        };
    }

    static async getPlaylistSongList(
        guildID: string,
        kmqPlaylistIdentifier: string,
        forceRefreshMetadata: boolean,
        messageContext?: MessageContext,
        interaction?: Eris.CommandInteraction,
    ): Promise<QueriedSongList & MatchedPlaylist> {
        const kmqPlaylistParsed = parseKmqPlaylistIdentifier(
            kmqPlaylistIdentifier,
        );

        const { matchedSongs, metadata, truncated, unmatchedSongs } =
            kmqPlaylistParsed.isSpotify
                ? await State.spotifyManager.getMatchedSpotifyPlaylist(
                      guildID,
                      kmqPlaylistParsed.playlistId,
                      forceRefreshMetadata,
                      messageContext,
                      interaction,
                  )
                : await State.spotifyManager.getMatchedYoutubePlaylist(
                      guildID,
                      kmqPlaylistParsed.playlistId,
                      forceRefreshMetadata,
                      messageContext,
                      interaction,
                  );

        const result = new Set(matchedSongs);

        return {
            songs: result,
            countBeforeLimit: result.size,
            matchedSongs,
            metadata,
            truncated,
            unmatchedSongs,
        };
    }
}
