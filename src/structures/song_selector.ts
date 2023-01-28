import {
    FOREIGN_LANGUAGE_TAGS,
    NON_OFFICIAL_VIDEO_TAGS,
    SELECTION_WEIGHT_VALUES_EASY,
    SELECTION_WEIGHT_VALUES_HARD,
    SHADOW_BANNED_ARTIST_IDS,
} from "../constants";
import { IPCLogger } from "../logger";
import { chooseWeightedRandom, setDifference } from "../helpers/utils";
import ArtistType from "../enums/option_types/artist_type";
import Gender from "../enums/option_types/gender";
import LanguageType from "../enums/option_types/language_type";
import OstPreference from "../enums/option_types/ost_preference";
import ReleaseType from "../enums/option_types/release_type";
import ShuffleType from "../enums/option_types/shuffle_type";
import State from "../state";
import SubunitsPreference from "../enums/option_types/subunit_preference";
import dbContext from "../database_context";
import type { MatchedPlaylist } from "../helpers/spotify_manager";
import type GuildPreference from "./guild_preference";
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

    /** List of songs played with ,shuffle unique enabled */
    public uniqueSongsPlayed: Set<string>;

    /** The last gender played when gender is set to alternating, can be null (in not alternating mode), GENDER.MALE, or GENDER.FEMALE */
    public lastAlternatingGender: Gender | null;

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
            [...this.filteredSongs.songs].map((x) => x.youtubeLink)
        );

        return {
            uniqueSongsPlayed:
                this.uniqueSongsPlayed.size -
                setDifference([...this.uniqueSongsPlayed], [...filteredSongs])
                    .size,
            totalSongs: Math.min(
                this.filteredSongs.countBeforeLimit,
                guildPreference.gameOptions.limitEnd -
                    guildPreference.gameOptions.limitStart
            ),
        };
    }

    checkUniqueSongQueue(): boolean {
        const selectedSongs = this.getSongs().songs;
        const filteredSongs = new Set(
            [...selectedSongs].map((x) => x.youtubeLink)
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
                    Math.random() < 0.5 ? Gender.MALE : Gender.FEMALE;
            } else {
                this.lastAlternatingGender =
                    this.lastAlternatingGender === Gender.MALE
                        ? Gender.FEMALE
                        : Gender.MALE;
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
                guildPreference.gameOptions.shuffleType
            );
        } else {
            randomSong = SongSelector.selectRandomSong(
                selectedSongs,
                ignoredSongs,
                null,
                guildPreference.gameOptions.shuffleType
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
     * @param alternatingGender - The gender to limit selecting from if ,gender alternating
     * @param shuffleType - The shuffle type
     * @returns the QueriedSong
     */
    static selectRandomSong(
        filteredSongs: Set<QueriedSong>,
        ignoredSongs: Set<string>,
        alternatingGender: Gender | null,
        shuffleType = ShuffleType.RANDOM
    ): QueriedSong | null {
        let queriedSongList = [...filteredSongs];
        if (ignoredSongs) {
            queriedSongList = queriedSongList.filter(
                (x) => !ignoredSongs.has(x.youtubeLink)
            );
        }

        if (
            alternatingGender &&
            queriedSongList.some(
                (y) =>
                    y.members === alternatingGender || y.members === Gender.COED
            )
        ) {
            queriedSongList = queriedSongList.filter(
                (song) =>
                    song.members === alternatingGender ||
                    song.members === Gender.COED
            );
        }

        if (queriedSongList.length === 0) {
            return null;
        }

        switch (shuffleType) {
            case ShuffleType.POPULARITY:
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
        isPremium: boolean,
        playlistID?: string
    ): Promise<MatchedPlaylist | null> {
        if (!playlistID) {
            this.filteredSongs = await SongSelector.getFilteredSongList(
                guildPreference,
                isPremium,
                SHADOW_BANNED_ARTIST_IDS
            );

            return null;
        }

        const playlist = await SongSelector.getSpotifySongList(
            isPremium,
            playlistID
        );

        this.filteredSongs = playlist as QueriedSongList;
        return playlist;
    }

    /**
     * @returns the fields queried to generate the song list
     */
    static getQueriedSongFields(): Array<string> {
        return [
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
            "available_songs.members",
            "available_songs.tags",
            "available_songs.views",
            "available_songs.rank",
            "available_songs.vtype",
        ];
    }

    /**
     * Returns a list of songs from the data store, narrowed down by the specified game options
     * @param guildPreference - The GuildPreference
     * @param premium - Whether the game is premium
     * @param shadowBannedArtistIds - artist IDs that shouldn't be populated by subunit inclusion
     * @returns a list of songs, as well as the number of songs before the filter option was applied
     */
    static async getFilteredSongList(
        guildPreference: GuildPreference,
        premium: boolean = false,
        shadowBannedArtistIds: Array<number> = []
    ): Promise<{ songs: Set<QueriedSong>; countBeforeLimit: number }> {
        const gameOptions = guildPreference.gameOptions;
        let result: Array<QueriedSong> = [];
        let queryBuilder = dbContext
            .kmq("available_songs")
            .select(SongSelector.getQueriedSongFields());

        if (gameOptions.forcePlaySongID) {
            queryBuilder = queryBuilder.where(
                "link",
                "=",
                gameOptions.forcePlaySongID
            );
            return {
                songs: new Set(await queryBuilder),
                countBeforeLimit: 1,
            };
        }

        let subunits: Array<String> = [];
        let collabGroupContainingSubunit: Array<string> = [];
        if (gameOptions.subunitPreference === SubunitsPreference.INCLUDE) {
            subunits = (
                await dbContext
                    .kpopVideos("app_kpop_group")
                    .select("id")
                    .whereIn("id_parentgroup", guildPreference.getGroupIDs())
                    .whereNotIn("id", shadowBannedArtistIds)
            ).map((x) => x["id"]);

            collabGroupContainingSubunit = (
                await dbContext
                    // collab matches
                    .kpopVideos("app_kpop_agrelation")
                    .select(["id", "name"])
                    .distinct("id", "name")
                    .join("app_kpop_group", function join() {
                        this.on(
                            "app_kpop_agrelation.id_subgroup",
                            "=",
                            "app_kpop_group.id"
                        );
                    })
                    .whereIn("app_kpop_agrelation.id_artist", subunits)
                    .andWhere("app_kpop_group.is_collab", "y")
            ).map((x) => x["id"]);
        }

        queryBuilder = queryBuilder.where(function artistFilter() {
            this.where(function includesInnerArtistFilter() {
                if (!guildPreference.isGroupsMode()) {
                    if (
                        gameOptions.subunitPreference ===
                        SubunitsPreference.EXCLUDE
                    ) {
                        this.whereIn(
                            "id_artist",
                            guildPreference.getIncludesGroupIDs()
                        );
                    } else {
                        this.andWhere(function () {
                            this.whereIn(
                                "id_artist",
                                guildPreference.getIncludesGroupIDs()
                            ).orWhereIn(
                                "id_parent_artist",
                                guildPreference.getIncludesGroupIDs()
                            );
                        });
                    }
                }
            }).orWhere(function mainInnerArtistFilter() {
                this.whereNotIn(
                    "id_artist",
                    guildPreference.getExcludesGroupIDs()
                );
                if (!guildPreference.isGroupsMode()) {
                    const gender = guildPreference.isGenderAlternating()
                        ? [Gender.MALE, Gender.FEMALE, Gender.COED]
                        : gameOptions.gender;

                    this.whereIn("members", gender);

                    // filter by artist type only in non-groups
                    if (gameOptions.artistType !== ArtistType.BOTH) {
                        this.andWhere(
                            "issolo",
                            "=",
                            gameOptions.artistType === ArtistType.SOLOIST
                                ? "y"
                                : "n"
                        );
                    }
                } else if (
                    gameOptions.subunitPreference === SubunitsPreference.EXCLUDE
                ) {
                    this.whereIn("id_artist", guildPreference.getGroupIDs());
                } else {
                    this.andWhere(function () {
                        this.whereIn(
                            "id_artist",
                            guildPreference.getGroupIDs()
                        ).orWhere(function subunitFilter() {
                            this.whereIn(
                                "id_parent_artist",
                                guildPreference.getGroupIDs()
                            )
                                .whereNotIn("id_artist", shadowBannedArtistIds)
                                .orWhereIn(
                                    "id_artist",
                                    collabGroupContainingSubunit
                                );
                        });
                    });
                }
            });
        });

        if (gameOptions.languageType === LanguageType.KOREAN) {
            for (const tag of FOREIGN_LANGUAGE_TAGS) {
                queryBuilder = queryBuilder.where(
                    "tags",
                    "NOT LIKE",
                    `%${tag}%`
                );
            }
        }

        if (gameOptions.ostPreference === OstPreference.EXCLUDE) {
            queryBuilder = queryBuilder.where("tags", "NOT LIKE", "%o%");
        } else if (gameOptions.ostPreference === OstPreference.EXCLUSIVE) {
            queryBuilder = queryBuilder.where("tags", "LIKE", "%o%");
        }

        if (gameOptions.releaseType === ReleaseType.OFFICIAL) {
            queryBuilder = queryBuilder.where("vtype", "=", "main");
            for (const tag of NON_OFFICIAL_VIDEO_TAGS) {
                queryBuilder = queryBuilder.where(
                    "tags",
                    "NOT LIKE",
                    `%${tag}%`
                );
            }
        }

        queryBuilder = queryBuilder
            .andWhere("publishedon", ">=", `${gameOptions.beginningYear}-01-01`)
            .andWhere("publishedon", "<=", `${gameOptions.endYear}-12-31`)
            .orderBy("views", "DESC");

        queryBuilder = queryBuilder.andWhere(
            "rank",
            "<=",
            premium
                ? process.env.PREMIUM_AUDIO_SONGS_PER_ARTIST
                : process.env.AUDIO_SONGS_PER_ARTIST
        );

        result = await queryBuilder;

        const count = result.length;
        result = result.slice(gameOptions.limitStart, gameOptions.limitEnd);
        const shuffleType = gameOptions.shuffleType;
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
                        (index / result.length) * selectionWeightValues.length
                    )
                ],
        }));

        return {
            songs: new Set(result),
            countBeforeLimit: count,
        };
    }

    static async getSpotifySongList(
        isPremium: boolean,
        playlistID: string
    ): Promise<QueriedSongList & MatchedPlaylist> {
        const { matchedSongs, metadata } =
            await State.spotifyManager.getMatchedSpotifySongs(
                playlistID,
                isPremium
            );

        const result = new Set(
            matchedSongs.filter(
                (x) =>
                    x.rank <=
                    Number(
                        isPremium
                            ? process.env.PREMIUM_AUDIO_SONGS_PER_ARTIST
                            : process.env.AUDIO_SONGS_PER_ARTIST
                    )
            )
        );

        return {
            songs: result,
            countBeforeLimit: result.size,
            matchedSongs,
            metadata,
        };
    }
}
