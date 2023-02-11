/* eslint-disable no-await-in-loop */
import { IPCLogger } from "../logger";
import { normalizeArtistNameEntry } from "./game_utils";
import { retryJob } from "./utils";
import Axios from "axios";
import SongSelector from "../structures/song_selector";
import State from "../state";
import _ from "lodash";
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
            "market=US&fields=items(track(name,artists(name))),next&limit=50"
        )}`;

        if (State.cachedPlaylists[spotifyMetadata.snapshotID]) {
            logger.info(`Using cached playlist for ${playlistID}`);
            spotifySongs = State.cachedPlaylists[spotifyMetadata.snapshotID];
        } else {
            logger.info(`Using Spotify API for playlist ${playlistID}`);
            do {
                try {
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

            State.cachedPlaylists[spotifyMetadata.snapshotID] = spotifySongs;
        }

        logger.info(
            `Starting to parse playlist: ${playlistID}, number of songs: ${spotifySongs.length}`
        );
        let matchedSongs: Array<QueriedSong> = [];
        const unmatchedSongs: Array<SpotifyTrack> = [];
        for (const song of spotifySongs) {
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
            const songNames = [songNameBracketComponents[0], song.name];
            if (songNameBracketComponents.length > 1) {
                songNames.push(songNameBracketComponents[1].replace(")", ""));
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
                            "REGEXP_REPLACE(available_songs.song_name_en, '[^0-9a-zA-Z]', '') LIKE ?",
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
                matchedSongs.push(result);
            } else {
                unmatchedSongs.push(song);
            }
        }

        logger.info(`Finished parsing playlist: ${playlistID}`);

        if (unmatchedSongs.length > 0) {
            logger.info(
                `Unmatched Spotify songs for playlistID = ${playlistID}: ${JSON.stringify(
                    unmatchedSongs.map((x) => `${x.name} - ${x.artists[0]}`)
                )}`
            );
        }

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
    } | null> {
        const requestURL = `${BASE_URL}/playlists/${playlistID}`;
        let thumbnailUrl: string | null = null;
        let playlistName: string;
        let snapshotID: string;
        try {
            const response = (
                await Axios.get(requestURL, {
                    headers: {
                        Authorization: `Bearer ${this.accessToken}`,
                        "Content-Type": "application/x-www-form-urlencoded",
                    },
                })
            ).data;

            playlistName = response.name;
            snapshotID = response.snapshot_id;
            if (response.images.length > 0) {
                thumbnailUrl = response.images[0].url;
            }
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

        return { playlistName, thumbnailUrl, snapshotID };
    }
}
