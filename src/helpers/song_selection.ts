/**
 * Returns a list of songs from the data store, narrowed down by the specified game options
 * @param guildPreference - The GuildPreference
 * @param ignoredSongs - List of YouTube video IDs of songs to ignore
 * @returns a list of songs, as well as the number of songs before the filter option was applied
 */

import dbContext from "../database_context";
import { Gender } from "../commands/game_options/gender";
import GuildPreference from "../structures/guild_preference";
import { QueriedSong } from "../types";
import { SubunitsPreference } from "../commands/game_options/subunits";
import { ArtistType } from "../commands/game_options/artisttype";
import { LanguageType } from "../commands/game_options/language";

// eslint-disable-next-line import/prefer-default-export
export async function getFilteredSongList(guildPreference: GuildPreference, ignoredSongs?: Set<string>, alternatingGender?: Gender): Promise<{ songs: QueriedSong[], countBeforeLimit: number }> {
    let queryBuilder = dbContext.kmq("available_songs")
        .select(["song_name as name", "artist_name as artist", "link as youtubeLink", "publishedon as publishDate"])
        .where(function artistFilter() {
            this.where(function includesInnerArtistFilter() {
                if (!guildPreference.isGroupsMode()) {
                    if (guildPreference.getSubunitPreference() === SubunitsPreference.EXCLUDE) {
                        this.whereIn("id_artist", guildPreference.getIncludesGroupIds());
                    } else {
                        this.andWhere(function () {
                            this.whereIn("id_artist", guildPreference.getIncludesGroupIds())
                                .orWhereIn("id_parent_artist", guildPreference.getIncludesGroupIds());
                        });
                    }
                }
            }).orWhere(function mainInnerArtistFilter() {
                this.whereNotIn("id_artist", guildPreference.getExcludesGroupIds());
                if (!guildPreference.isGroupsMode()) {
                    const gender = guildPreference.isGenderAlternating() ? [Gender.MALE, Gender.FEMALE] : guildPreference.getGender();
                    this.whereIn("members", gender);

                    // filter by artist type only in non-groups
                    if (guildPreference.getArtistType() !== ArtistType.BOTH) {
                        this.andWhere("issolo", "=", guildPreference.getArtistType() === ArtistType.SOLOIST ? "y" : "n");
                    }
                } else {
                    // eslint-disable-next-line no-lonely-if
                    if (guildPreference.getSubunitPreference() === SubunitsPreference.EXCLUDE) {
                        this.whereIn("id_artist", guildPreference.getGroupIds());
                    } else {
                        this.andWhere(function () {
                            this.whereIn("id_artist", guildPreference.getGroupIds())
                                .orWhereIn("id_parent_artist", guildPreference.getGroupIds());
                        });
                    }
                }
            });
        });

    if (guildPreference.getLanguageType() === LanguageType.KOREAN) {
        queryBuilder = queryBuilder
            .where("song_name", "NOT LIKE", "%(cn)%")
            .where("song_name", "NOT LIKE", "%(en)%")
            .where("song_name", "NOT LIKE", "%(jp)%");
    }
    queryBuilder = queryBuilder
        .andWhere("publishedon", ">=", `${guildPreference.getBeginningCutoffYear()}-01-01`)
        .andWhere("publishedon", "<=", `${guildPreference.getEndCutoffYear()}-12-31`)
        .orderBy("views", "DESC");

    let result: Array<QueriedSong> = await queryBuilder;

    const count = result.length;
    result = result.slice(guildPreference.getLimitStart(), guildPreference.getLimitEnd());
    if (ignoredSongs && ignoredSongs.size > 0) {
        result = result.filter((song) => !ignoredSongs.has(song.youtubeLink));
    }
    if (guildPreference.isGenderAlternating() && alternatingGender) {
        const alternatingResult = await dbContext.kmq("available_songs")
            .select(["song_name as name", "artist_name as artist", "link as youtubeLink", "publishedon as publishDate"])
            .whereIn("link", result.map((song) => song.youtubeLink))
            .andWhere("members", "=", [alternatingGender]);
        if (alternatingResult.length > 0) {
            result = alternatingResult;
        }
    }
    return {
        songs: result,
        countBeforeLimit: count,
    };
}
