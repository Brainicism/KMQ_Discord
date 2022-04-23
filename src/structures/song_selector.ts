import type GuildPreference from "./guild_preference";
import dbContext from "../database_context";
import { IPCLogger } from "../logger";
import { chooseWeightedRandom, setDifference } from "../helpers/utils";
import QueriedSong from "../interfaces/queried_song";
import UniqueSongCounter from "../interfaces/unique_song_counter";
import { Gender } from "../enums/option_types/gender";
import { ShuffleType } from "../enums/option_types/shuffle_type";
import { SubunitsPreference } from "../enums/option_types/subunit_preference";
import { ArtistType } from "../enums/option_types/artist_type";
import { OstPreference } from "../enums/option_types/ost_preference";
import { LanguageType } from "../enums/option_types/language_type";
import { ReleaseType } from "../enums/option_types/release_type";
import { FOREIGN_LANGUAGE_TAGS, NON_OFFICIAL_VIDEO_TAGS } from "../constants";

export const LAST_PLAYED_SONG_QUEUE_SIZE = 10;
export const SELECTION_WEIGHT_VALUES_HARD = [1, 2, 4, 8, 16];
export const SELECTION_WEIGHT_VALUES_EASY = [
    ...SELECTION_WEIGHT_VALUES_HARD,
].reverse();

const logger = new IPCLogger("song_selector");

export default class SongSelector {
    /** List of songs matching the user's game options */
    public filteredSongs: { songs: Set<QueriedSong>; countBeforeLimit: number };

    /** List of songs played with ,shuffle unique enabled */
    public uniqueSongsPlayed: Set<string>;

    /** The last gender played when gender is set to alternating, can be null (in not alternating mode), GENDER.MALE, or GENDER.FEMALE */
    public lastAlternatingGender: Gender;

    constructor() {
        this.filteredSongs = null;
        this.uniqueSongsPlayed = new Set();
        this.lastAlternatingGender = null;
    }

    getUniqueSongCounter(guildPreference: GuildPreference): UniqueSongCounter {
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

    queryRandomSong(guildPreference: GuildPreference): QueriedSong {
        const selectedSongs = this.getSongs().songs;
        let randomSong: QueriedSong;
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
        ignoredSongs?: Set<string>,
        alternatingGender?: Gender,
        shuffleType = ShuffleType.RANDOM
    ): QueriedSong {
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
        return this.filteredSongs;
    }

    getCurrentSongCount(): number {
        return this.filteredSongs.songs.size;
    }

    async reloadSongs(
        guildPreference: GuildPreference,
        isPremium: boolean
    ): Promise<void> {
        this.filteredSongs = await SongSelector.getFilteredSongList(
            guildPreference,
            isPremium
        );
    }

    /**
     * @returns the fields queried to generate the song list
     */
    static getQueriedSongFields(): Array<string> {
        return [
            "clean_song_name_en as songName",
            "song_name_en as originalSongName",
            "song_name_ko as hangulSongName",
            "clean_song_name_ko as originalHangulSongName",
            "artist_name_en as artistName",
            "artist_name_ko as hangulArtistName",
            "link as youtubeLink",
            "publishedon as publishDate",
            "members",
            "id_artist as artistID",
            "issolo as isSolo",
            "members",
            "tags",
            "views",
            "rank",
            "vtype",
        ];
    }

    /**
     * Returns a list of songs from the data store, narrowed down by the specified game options
     * @param guildPreference - The GuildPreference
     * @param premium - Whether the game is premium
     * @returns a list of songs, as well as the number of songs before the filter option was applied
     */
    static async getFilteredSongList(
        guildPreference: GuildPreference,
        premium: boolean = false
    ): Promise<{ songs: Set<QueriedSong>; countBeforeLimit: number }> {
        let queryBuilder = dbContext
            .kmq("available_songs")
            .select(SongSelector.getQueriedSongFields());

        if (guildPreference.gameOptions.forcePlaySongID) {
            queryBuilder = queryBuilder.where(
                "link",
                "=",
                guildPreference.gameOptions.forcePlaySongID
            );
            return {
                songs: new Set(await queryBuilder),
                countBeforeLimit: 1,
            };
        }

        const gameOptions = guildPreference.gameOptions;
        let subunits = [];
        let collabGroupContainingSubunit = [];
        if (gameOptions.subunitPreference === SubunitsPreference.INCLUDE) {
            subunits = (
                await dbContext
                    .kpopVideos("app_kpop_group")
                    .select("id")
                    .whereIn("id_parentgroup", guildPreference.getGroupIDs())
            ).map((x) => x["id"]);

            collabGroupContainingSubunit = (
                await dbContext
                    .kpopVideos("app_kpop_group")
                    .select("id")
                    .whereIn("id_artist1", subunits)
                    .orWhereIn("id_artist2", subunits)
                    .orWhereIn("id_artist3", subunits)
                    .orWhereIn("id_artist4", subunits)
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
                } else {
                    if (
                        gameOptions.subunitPreference ===
                        SubunitsPreference.EXCLUDE
                    ) {
                        this.whereIn(
                            "id_artist",
                            guildPreference.getGroupIDs()
                        );
                    } else {
                        this.andWhere(function () {
                            this.whereIn(
                                "id_artist",
                                guildPreference.getGroupIDs()
                            )
                                .orWhereIn(
                                    "id_parent_artist",
                                    guildPreference.getGroupIDs()
                                )
                                .orWhereIn(
                                    "id_artist",
                                    collabGroupContainingSubunit
                                );
                        });
                    }
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

        let result: Array<QueriedSong> = await queryBuilder;

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
}
