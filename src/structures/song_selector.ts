import { QueriedSong } from "../types";
import GuildPreference from "./guild_preference";
import dbContext from "../database_context";
import { SubunitsPreference } from "../commands/game_options/subunits";
import { ArtistType } from "../commands/game_options/artisttype";
import { Gender } from "../commands/game_options/gender";
import {
    LanguageType,
    FOREIGN_LANGUAGE_TAGS,
} from "../commands/game_options/language";
import { OstPreference } from "../commands/game_options/ost";
import {
    ReleaseType,
    NON_OFFICIAL_VIDEO_TAGS,
} from "../commands/game_options/release";
import { setDifference } from "../helpers/utils";
import { ShuffleType } from "../commands/game_options/shuffle";

export const LAST_PLAYED_SONG_QUEUE_SIZE = 10;

export interface UniqueSongCounter {
    uniqueSongsPlayed: number;
    totalSongs: number;
}

export default class SongSelector {
    /** List of songs matching the user's game options */
    public filteredSongs: { songs: Set<QueriedSong>; countBeforeLimit: number };

    /** List of songs played with ,shuffle unique enabled */
    public uniqueSongsPlayed: Set<string>;

    /** List of recently played songs used to prevent frequent repeats */
    public lastPlayedSongs: Array<string>;

    /** The last gender played when gender is set to alternating, can be null (in not alternating mode), GENDER.MALE, or GENDER.FEMALE */
    public lastAlternatingGender: Gender;

    constructor() {
        this.filteredSongs = null;
        this.uniqueSongsPlayed = new Set();
        this.lastPlayedSongs = [];
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

    checkUniqueSongQueue(guildPreference: GuildPreference): boolean {
        // In updateSongCount, songs already played are added to songCount when options change. On unique reset, remove them
        const selectedSongs = this.getSongs().songs;
        if (guildPreference.gameOptions.shuffleType === ShuffleType.UNIQUE) {
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
        } else {
            this.resetUniqueSongs();
        }

        return false;
    }

    checkLastPlayedSongs(): void {
        const selectedSongs = this.getSongs().songs;
        const selectedSongsCount = selectedSongs.size;
        if (selectedSongsCount <= LAST_PLAYED_SONG_QUEUE_SIZE) {
            this.lastPlayedSongs = [];
        } else if (
            this.lastPlayedSongs.length === LAST_PLAYED_SONG_QUEUE_SIZE
        ) {
            this.lastPlayedSongs.shift();

            // Randomize songs from oldest LAST_PLAYED_SONG_QUEUE_SIZE / 2 songs
            // when lastPlayedSongs is in use but selectedSongsCount small
            if (selectedSongsCount <= LAST_PLAYED_SONG_QUEUE_SIZE * 2) {
                this.lastPlayedSongs.splice(0, LAST_PLAYED_SONG_QUEUE_SIZE / 2);
            }
        }
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

    async queryRandomSong(
        guildPreference: GuildPreference
    ): Promise<QueriedSong> {
        const selectedSongs = this.getSongs().songs;
        const selectedSongsCount = selectedSongs.size;
        let randomSong: QueriedSong;
        const ignoredSongs = new Set([
            ...this.lastPlayedSongs,
            ...this.uniqueSongsPlayed,
        ]);

        if (this.lastAlternatingGender) {
            randomSong = await SongSelector.selectRandomSong(
                selectedSongs,
                ignoredSongs,
                this.lastAlternatingGender
            );
        } else {
            randomSong = await SongSelector.selectRandomSong(
                selectedSongs,
                ignoredSongs
            );
        }

        this.checkLastPlayedSongs();

        if (randomSong === null) {
            return null;
        }

        if (selectedSongsCount > LAST_PLAYED_SONG_QUEUE_SIZE) {
            this.lastPlayedSongs.push(randomSong.youtubeLink);
        }

        if (guildPreference.gameOptions.shuffleType === ShuffleType.UNIQUE) {
            this.uniqueSongsPlayed.add(randomSong.youtubeLink);
        }

        return randomSong;
    }

    /**
     * Selects a random song based on the GameOptions, avoiding recently played songs
     * @param filteredSongs - The filtered songs to select from
     * @param ignoredSongs - The union of last played songs and unique songs to not select from
     * @param alternatingGender - The gender to limit selecting from if ,gender alternating
     */
    static async selectRandomSong(
        filteredSongs: Set<QueriedSong>,
        ignoredSongs?: Set<string>,
        alternatingGender?: Gender
    ): Promise<QueriedSong> {
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

        return queriedSongList[
            Math.floor(Math.random() * queriedSongList.length)
        ];
    }

    /**
     * Resets the unique songs set
     */
    resetUniqueSongs(): void {
        this.uniqueSongsPlayed.clear();
        this.lastPlayedSongs = [];
    }

    getSongs(): { songs: Set<QueriedSong>; countBeforeLimit: number } {
        return this.filteredSongs;
    }

    getCurrentSongCount(): number {
        return this.filteredSongs.songs.size;
    }

    async reloadSongs(guildPreference: GuildPreference): Promise<void> {
        this.filteredSongs = await SongSelector.getFilteredSongList(
            guildPreference
        );
    }

    /**
     * Returns a list of songs from the data store, narrowed down by the specified game options
     * @param guildPreference - The GuildPreference
     * @returns a list of songs, as well as the number of songs before the filter option was applied
     */
    static async getFilteredSongList(
        guildPreference: GuildPreference
    ): Promise<{ songs: Set<QueriedSong>; countBeforeLimit: number }> {
        const fields = [
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
        ];

        let queryBuilder = dbContext.kmq("available_songs").select(fields);

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
                        const subunits = dbContext
                            .kmq("kpop_groups")
                            .select("id")
                            .whereIn(
                                "id_parentgroup",
                                guildPreference.getGroupIDs()
                            );

                        const collabGroupContainingSubunit = dbContext
                            .kmq("kpop_groups")
                            .select("id")
                            .whereIn("id_artist1", subunits)
                            .orWhereIn("id_artist2", subunits)
                            .orWhereIn("id_artist3", subunits)
                            .orWhereIn("id_artist4", subunits);

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

        let result: Array<QueriedSong> = await queryBuilder;

        const count = result.length;
        result = result.slice(gameOptions.limitStart, gameOptions.limitEnd);
        return {
            songs: new Set(result),
            countBeforeLimit: count,
        };
    }
}
