/* eslint-disable no-await-in-loop */
import { IPCLogger } from "../logger";
import { normalizeArtistNameEntry } from "./game_utils";
import { retryJob } from "./utils";
import Axios from "axios";
import SongSelector from "../structures/song_selector";
import State from "../state";
import _ from "lodash";
import asyncPool from "tiny-async-pool";
import dbContext from "../database_context";
import type { AxiosResponse } from "axios";
import type QueriedSong from "../interfaces/queried_song";
import type SpotifyTrack from "../interfaces/spotify_track";

const logger = new IPCLogger("spotify_manager");

const BASE_URL = "https://api.spotify.com/v1";

export interface PlaylistMetadata {
    playlistID: string;
    playlistName: string;
    playlistLength: number;
    matchedSongsLength: number;
    thumbnailUrl?: string;
}

export interface MatchedPlaylist {
    matchedSongs: Array<QueriedSong>;
    metadata: PlaylistMetadata;
}

export default class SpotifyManager {
    private accessToken: string;

    constructor() {
        this.refreshToken();
    }

    start(): void {
        setInterval(async () => {
            await this.refreshToken();
        }, 3600000);
    }

    /**
     * @param playlistID - The playlist to retrieve songs from
     * @param isPremium - Whether the user is premium or not
     *
     */
    getMatchedSpotifySongs = async (
        playlistID: string,
        isPremium: boolean
    ): Promise<MatchedPlaylist> => {
        if (
            !process.env.SPOTIFY_CLIENT_ID ||
            !process.env.SPOTIFY_CLIENT_SECRET
        ) {
            logger.warn(
                "No songs matched due to missing Spotify client ID or secret"
            );
            return {
                metadata: {
                    playlistID,
                    playlistName: "",
                    playlistLength: 0,
                    matchedSongsLength: 0,
                },
                matchedSongs: [],
            };
        }

        const spotifyMetadata = await this.getPlaylistMetadata(playlistID);
        if (!spotifyMetadata) {
            return {
                metadata: {
                    playlistID,
                    playlistName: "",
                    playlistLength: 0,
                    matchedSongsLength: 0,
                },
                matchedSongs: [],
            };
        }

        let spotifySongs: Array<SpotifyTrack> = [];
        let requestURL = `${BASE_URL}/playlists/${playlistID}/tracks?${encodeURI(
            `market=US&fields=items(track(name,artists(name))),next&limit=${spotifyMetadata.limit}`
        )}`;

        if (State.cachedPlaylists[spotifyMetadata.snapshotID]) {
            logger.info(`Using cached playlist for ${playlistID}`);
            spotifySongs = State.cachedPlaylists[spotifyMetadata.snapshotID];
        } else {
            const start = Date.now();
            logger.info(`Using Spotify API for playlist ${playlistID}`);

            let pageNumber = 0;
            do {
                try {
                    pageNumber++;
                    logger.info(
                        `Grabbing Spotify song data ${pageNumber}/${Math.ceil(
                            spotifyMetadata.songCount / spotifyMetadata.limit
                        )} of playlist ${playlistID}`
                    );

                    const spotifyRequest = async (
                        url: string
                    ): Promise<AxiosResponse> =>
                        Axios.get(url, {
                            headers: {
                                Authorization: `Bearer ${this.accessToken}`,
                                "Content-Type":
                                    "application/x-www-form-urlencoded",
                            },
                        });

                    let response = await spotifyRequest(requestURL);

                    const rateLimit = Number(response.headers["retry-after"]);
                    if (rateLimit) {
                        logger.warn(
                            `Spotify rate limit exceeded, waiting ${rateLimit} seconds...`
                        );

                        response = await retryJob(
                            spotifyRequest,
                            [requestURL],
                            1,
                            false,
                            rateLimit
                        );
                    }

                    spotifySongs.push(
                        ...response.data.items.reduce(
                            (
                                songs: Array<SpotifyTrack>,
                                song: {
                                    track: {
                                        name: string;
                                        artists: Array<{ name: string }>;
                                    };
                                }
                            ) => {
                                let parsedSong: SpotifyTrack;
                                try {
                                    parsedSong = {
                                        name: song.track.name,
                                        artists: song.track.artists.map(
                                            (artist: { name: string }) =>
                                                artist.name
                                        ),
                                    };
                                } catch (err) {
                                    logger.warn(
                                        `Failed parsing song. song = ${JSON.stringify(
                                            song
                                        )}. err = ${err}`
                                    );
                                    return songs;
                                }

                                songs.push(parsedSong);
                                return songs;
                            },
                            []
                        )
                    );

                    requestURL = response.data.next;
                } catch (err) {
                    logger.error(
                        `Failed fetching Spotify playlist. err = ${err}`
                    );

                    if (err.response) {
                        logger.info(err.response.data);
                        logger.info(err.response.status);
                    }

                    break;
                }
            } while (requestURL);

            logger.info(
                `Finished grabbing Spotify song data for playlist ${playlistID} after ${
                    Date.now() - start
                }ms`
            );

            State.cachedPlaylists[spotifyMetadata.snapshotID] = spotifySongs;
        }

        let matchedSongs: Array<QueriedSong> = [];
        let unmatchedSongCount = 0;

        logger.info(
            `Starting to parse playlist: ${playlistID}, number of songs: ${spotifySongs.length}`
        );
        const start = Date.now();
        for await (const queryOutput of asyncPool(
            4,
            spotifySongs,
            (x: SpotifyTrack) => this.generateSongMatchingPromise(x, isPremium)
        )) {
            if ((unmatchedSongCount + matchedSongs.length) % 100 === 0) {
                logger.info(
                    `Processed ${unmatchedSongCount + matchedSongs.length}/${
                        spotifySongs.length
                    } for playlist ${playlistID}`
                );
            }

            if (typeof queryOutput === "string") {
                unmatchedSongCount++;
            } else {
                matchedSongs.push(queryOutput);
            }
        }

        const end = Date.now();
        logger.info(
            `Finished parsing playlist: ${playlistID} after ${end - start}ms.`
        );

        matchedSongs = _.uniq(matchedSongs);
        return {
            matchedSongs,
            metadata: {
                playlistID,
                playlistLength: spotifySongs.length,
                playlistName: spotifyMetadata.playlistName,
                matchedSongsLength: matchedSongs.length,
                thumbnailUrl: spotifyMetadata.thumbnailUrl as string,
            },
        };
    };

    private generateSongMatchingPromise(
        song: SpotifyTrack,
        isPremium: boolean
    ): Promise<QueriedSong | string> {
        return new Promise(async (resolve) => {
            const aliasIDs: Array<number> = [];
            for (const artist of song.artists) {
                const lowercaseArtist = normalizeArtistNameEntry(artist);
                const artistMapping = State.artistToEntry[lowercaseArtist];
                if (artistMapping) {
                    aliasIDs.push(artistMapping.id);
                    if (State.aliases.artist[lowercaseArtist]) {
                        for (const alias of State.aliases.artist[
                            lowercaseArtist
                        ]) {
                            const lowercaseAlias =
                                normalizeArtistNameEntry(alias);

                            if (lowercaseAlias in State.artistToEntry) {
                                aliasIDs.push(
                                    State.artistToEntry[lowercaseAlias].id
                                );
                            }
                        }
                    }
                }
            }

            // handle songs with brackets in name, consider all components separately
            const songNameBracketComponents = song.name.split("(");
            const songNames = [songNameBracketComponents[0]];
            if (songNameBracketComponents.length > 1) {
                songNames.push(songNameBracketComponents[1].replace(")", ""));
                songNames.push(song.name);
            }

            const query = dbContext
                .kmq("available_songs")
                .join("kpop_videos.app_kpop_group", function () {
                    this.on(
                        "available_songs.id_artist",
                        "=",
                        "kpop_videos.app_kpop_group.id"
                    );

                    this.orOn(
                        "available_songs.id_parent_artist",
                        "=",
                        "kpop_videos.app_kpop_group.id"
                    );
                })
                .select(SongSelector.getQueriedSongFields())
                .where((qb) => {
                    for (const songName of songNames) {
                        // compare with non-alphanumeric characters removed
                        qb = qb.orWhereRaw(
                            "available_songs.clean_song_name_alpha_numeric LIKE ?",
                            [songName.replace(/[^0-9a-z]/gi, "")]
                        );
                    }

                    return qb;
                })
                .andWhere((qb) => {
                    qb.whereRaw("available_songs.artist_name_en LIKE ?", [
                        song.artists[0],
                    ])
                        .orWhereIn("id_artist", aliasIDs)
                        .orWhereIn("id_parentgroup", aliasIDs)
                        .orWhereIn("id_parent_artist", aliasIDs);
                })
                .andWhere(
                    "rank",
                    "<=",
                    isPremium
                        ? (process.env.PREMIUM_AUDIO_SONGS_PER_ARTIST as string)
                        : (process.env.AUDIO_SONGS_PER_ARTIST as string)
                )
                .first();

            const result = (await query) as QueriedSong;

            if (result) {
                resolve(result);
            } else {
                resolve(`${song.name} - ${song.artists[0]}`);
            }
        });
    }

    private refreshToken = async (): Promise<void> => {
        if (
            !process.env.SPOTIFY_CLIENT_ID ||
            !process.env.SPOTIFY_CLIENT_SECRET
        ) {
            return;
        }

        logger.info("Refreshing Spotify token...");
        const tokenURL = "https://accounts.spotify.com/api/token";
        const grantType = new URLSearchParams({
            grant_type: "client_credentials",
        });

        try {
            const resp = await Axios.post(tokenURL, grantType.toString(), {
                headers: {
                    Authorization: `Basic ${Buffer.from(
                        `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
                    ).toString("base64")}`,
                    "Content-Type": "application/x-www-form-urlencoded",
                },
            });

            this.accessToken = resp.data.access_token;
        } catch (err) {
            logger.error(`Failed to refresh Spotify token. err = ${err}`);
        }
    };

    private async getPlaylistMetadata(playlistID: string): Promise<{
        playlistName: string;
        thumbnailUrl: string | null;
        snapshotID: string;
        limit: number;
        songCount: number;
    } | null> {
        const requestURL = `${BASE_URL}/playlists/${playlistID}`;

        try {
            const response = (
                await Axios.get(requestURL, {
                    headers: {
                        Authorization: `Bearer ${this.accessToken}`,
                        "Content-Type": "application/x-www-form-urlencoded",
                    },
                })
            ).data;

            const playlistName = response.name;
            const snapshotID = response.snapshot_id;
            let thumbnailUrl: string | null = null;
            if (response.images.length > 0) {
                thumbnailUrl = response.images[0].url;
            }

            const limit = response.tracks.limit;
            const songCount = response.tracks.total;

            return {
                playlistName,
                thumbnailUrl,
                snapshotID,
                limit,
                songCount,
            };
        } catch (err) {
            logger.error(
                `Failed fetching Spotify playlist metadata. err = ${err}`
            );

            if (err.response) {
                logger.info(err.response.data);
                logger.info(err.response.status);
            }

            return null;
        }
    }
}
