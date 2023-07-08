/* eslint-disable no-await-in-loop */
import { IPCLogger } from "../logger";
import { normalizePunctuationInName } from "../structures/game_round";
import {
    pathExists,
    retryJob,
    retryWithExponentialBackoff,
    standardDateFormat,
} from "./utils";
import Axios from "axios";
import KmqConfiguration from "../kmq_configuration";
import SongSelector from "../structures/song_selector";
import State from "../state";
import _ from "lodash";
import asyncPool from "tiny-async-pool";
import dbContext from "../database_context";
import fs from "fs";
import path from "path";
import type { AxiosResponse } from "axios";
import type { MatchedPlaylist } from "../interfaces/matched_playlist";
import type { PlaylistMetadata } from "../interfaces/playlist_metadata";
import type QueriedSong from "../interfaces/queried_song";
import type SpotifyTrack from "../interfaces/spotify_track";

const logger = new IPCLogger("spotify_manager");

const BASE_URL = "https://api.spotify.com/v1";

const SONG_MATCH_TIMEOUT_MS = 15000;

export default class SpotifyManager {
    public cachedPlaylists: {
        [playlistID: string]: {
            metadata: PlaylistMetadata;
            matchedSongs: Array<QueriedSong>;
            truncated: boolean;
        };
    } = {};

    private accessToken: string | undefined;

    async start(): Promise<void> {
        await this.refreshToken();

        setInterval(async () => {
            await this.refreshToken();
        }, 3600000 * 0.8);
    }

    /**
     * @param playlistID - The playlist to retrieve songs from
     * @param isPremium - Whether the user is premium or not
     * @param forceRefreshMetadata - Whether to request new metadata
     *
     */
    getMatchedSpotifySongs = async (
        playlistID: string,
        isPremium: boolean,
        forceRefreshMetadata: boolean
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
                    limit: 0,
                    snapshotID: "",
                    thumbnailUrl: null,
                },
                matchedSongs: [],
                truncated: false,
            };
        }

        const cachedPlaylist = this.cachedPlaylists[playlistID];
        let spotifyMetadata: PlaylistMetadata | null;
        if (forceRefreshMetadata || !cachedPlaylist) {
            spotifyMetadata = await this.getPlaylistMetadata(playlistID);
            logger.info(
                `Refreshing Spotify metadata. forceRefreshMetadata: ${forceRefreshMetadata}, cachedPlaylist: ${!!cachedPlaylist}`
            );
        } else {
            spotifyMetadata = cachedPlaylist.metadata;
        }

        if (!spotifyMetadata) {
            return {
                metadata: {
                    playlistID,
                    playlistName: "",
                    playlistLength: 0,
                    matchedSongsLength: 0,
                    limit: 0,
                    snapshotID: "",
                    thumbnailUrl: null,
                },
                matchedSongs: [],
                truncated: false,
            };
        }

        let matchedSongs: Array<QueriedSong> = [];
        let truncated = false;

        if (
            cachedPlaylist &&
            cachedPlaylist.metadata.snapshotID === spotifyMetadata.snapshotID
        ) {
            logger.info(`Using cached playlist for ${playlistID}`);
            ({ matchedSongs, truncated } = cachedPlaylist);
        } else {
            const spotifySongs: Array<SpotifyTrack> = [];
            const start = Date.now();
            logger.info(`Using Spotify API for playlist ${playlistID}`);

            const numPlaylistPages = Math.ceil(
                spotifyMetadata.playlistLength / spotifyMetadata.limit
            );

            const requestURLs = [...Array(numPlaylistPages).keys()].map(
                (n) =>
                    `${BASE_URL}/playlists/${playlistID}/tracks?${encodeURI(
                        `market=US&fields=items(track(name,artists(name))),next&limit=${
                            spotifyMetadata!.limit
                        }&offset=${n * spotifyMetadata!.limit}`
                    )}`
            );

            let numProcessedPlaylistPages = 0;
            for await (const results of asyncPool(
                10,
                requestURLs,
                (requestURL: string) =>
                    this.generateSpotifyResponsePromise(requestURL)
            )) {
                numProcessedPlaylistPages++;
                if (
                    numProcessedPlaylistPages %
                        Math.floor(numPlaylistPages / 4) ===
                        1 ||
                    numProcessedPlaylistPages === numPlaylistPages ||
                    numProcessedPlaylistPages === 1
                ) {
                    logger.info(
                        `Calling Spotify API ${numProcessedPlaylistPages}/${numPlaylistPages} for playlist ${playlistID}`
                    );
                }

                spotifySongs.push(...results);
            }

            logger.info(
                `Finished grabbing Spotify song data for playlist ${playlistID} after ${
                    Date.now() - start
                }ms`
            );

            const unmatchedSongs: Array<String> = [];

            logger.info(
                `Starting to parse playlist: ${playlistID}, number of songs: ${spotifySongs.length}`
            );

            const songMatchStartTime = Date.now();
            for await (const queryOutput of asyncPool(
                4,
                spotifySongs,
                (x: SpotifyTrack) =>
                    this.generateSongMatchingPromise(x, isPremium)
            )) {
                if (typeof queryOutput === "string") {
                    unmatchedSongs.push(queryOutput);
                } else {
                    matchedSongs.push(queryOutput);
                }

                const processedSongCount =
                    unmatchedSongs.length + matchedSongs.length;

                if (
                    processedSongCount % 100 === 0 ||
                    processedSongCount === 1 ||
                    processedSongCount === spotifySongs.length
                ) {
                    logger.info(
                        `Processed ${processedSongCount}/${spotifySongs.length} for playlist ${playlistID}`
                    );
                }

                if (Date.now() - songMatchStartTime > SONG_MATCH_TIMEOUT_MS) {
                    logger.warn(
                        `Playlist '${playlistID}' exceeded song match timeout of ${SONG_MATCH_TIMEOUT_MS}ms after processing ${processedSongCount}/${spotifySongs.length}`
                    );
                    truncated = true;
                    break;
                }
            }

            logger.info(
                `Finished parsing playlist: ${playlistID} after ${
                    Date.now() - songMatchStartTime
                }ms.`
            );

            const SPOTIFY_PLAYLIST_UNMATCHED_SONGS_DIR = path.join(
                __dirname,
                "../../data/spotify_unmatched_playlists"
            );

            if (unmatchedSongs.length) {
                if (!(await pathExists(SPOTIFY_PLAYLIST_UNMATCHED_SONGS_DIR))) {
                    await fs.promises.mkdir(
                        SPOTIFY_PLAYLIST_UNMATCHED_SONGS_DIR
                    );
                }

                const playlistUnmatchedSongsPath = path.resolve(
                    __dirname,
                    SPOTIFY_PLAYLIST_UNMATCHED_SONGS_DIR,
                    `${playlistID}-${standardDateFormat(new Date())}.txt`
                );

                await fs.promises.writeFile(
                    playlistUnmatchedSongsPath,
                    unmatchedSongs.join("\n")
                );
            }

            if (KmqConfiguration.Instance.persistMatchedSpotifySongs()) {
                await fs.promises.writeFile(
                    path.resolve(
                        SPOTIFY_PLAYLIST_UNMATCHED_SONGS_DIR,
                        `${playlistID}-${standardDateFormat(
                            new Date()
                        )}.matched.txt`
                    ),
                    matchedSongs
                        .map((x) => `${x.songName} - ${x.artistName}`)
                        .join("\n")
                );
            }
        }

        spotifyMetadata.matchedSongsLength = matchedSongs.length;
        matchedSongs = _.uniqBy(matchedSongs, "youtubeLink");

        this.cachedPlaylists[playlistID] = {
            metadata: spotifyMetadata,
            matchedSongs,
            truncated,
        };

        return {
            matchedSongs,
            metadata: spotifyMetadata,
            truncated,
        };
    };

    private generateSpotifyResponsePromise(
        requestURL: string
    ): Promise<Array<SpotifyTrack>> {
        return new Promise(async (resolve, reject) => {
            try {
                const spotifyRequest = async (
                    url: string
                ): Promise<AxiosResponse> =>
                    Axios.get(url, {
                        headers: {
                            Authorization: `Bearer ${this.accessToken}`,
                            "Content-Type": "application/x-www-form-urlencoded",
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

                resolve(
                    response.data.items.reduce(
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
            } catch (err) {
                logger.error(`Failed fetching Spotify playlist. err = ${err}`);

                if (err.response) {
                    logger.error(err.response.data);
                    logger.error(err.response.status);
                }

                reject(err);
            }
        });
    }

    private generateSongMatchingPromise(
        song: SpotifyTrack,
        isPremium: boolean
    ): Promise<QueriedSong | string> {
        return new Promise(async (resolve) => {
            const aliasIDs: Array<number> = [];
            for (const artist of song.artists) {
                const lowercaseArtist = normalizePunctuationInName(artist);
                const artistMapping = State.artistToEntry[lowercaseArtist];
                if (artistMapping) {
                    aliasIDs.push(artistMapping.id);
                    if (State.aliases.artist[lowercaseArtist]) {
                        for (const alias of State.aliases.artist[
                            lowercaseArtist
                        ]) {
                            const lowercaseAlias =
                                normalizePunctuationInName(alias);

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

            const query = dbContext.kmq
                .selectFrom("available_songs")
                .innerJoin("kpop_videos.app_kpop_group", (jb) =>
                    jb.on(({ or, cmpr, ref }) =>
                        or([
                            cmpr(
                                "kpop_videos.app_kpop_group.id",
                                "=",
                                ref("available_songs.id_artist")
                            ),
                            cmpr(
                                "kpop_videos.app_kpop_group.id",
                                "=",
                                ref("available_songs.id_parent_artist")
                            ),
                        ])
                    )
                )
                .select(SongSelector.QueriedSongFields)
                .where(({ cmpr, or }) =>
                    or(
                        songNames.map((songName) =>
                            cmpr(
                                "available_songs.clean_song_name_alpha_numeric",
                                "like",
                                songName.replace(/[^0-9a-z]/gi, "")
                            )
                        )
                    )
                )
                .where(({ or, cmpr, and }) => {
                    const expressions = [
                        cmpr(
                            "available_songs.original_artist_name_en",
                            "like",
                            song.artists[0]
                        ),
                        and([
                            cmpr(
                                "available_songs.original_artist_name_en",
                                "like",
                                "%+%"
                            ),
                            cmpr(
                                "available_songs.original_artist_name_en",
                                "like",
                                `%${song.artists[0]}%`
                            ),
                        ]),
                        cmpr(
                            "available_songs.previous_name_en",
                            "like",
                            song.artists[0]
                        ),
                        cmpr("artist_aliases", "like", `%${song.artists[0]}%`),
                    ];

                    if (aliasIDs.length) {
                        expressions.push(
                            ...[
                                cmpr("id_parentgroup", "in", aliasIDs),
                                cmpr("id_artist", "in", aliasIDs),
                                cmpr("id_parent_artist", "in", aliasIDs),
                            ]
                        );
                    }

                    return or(expressions);
                })

                .where(
                    "rank",
                    "<=",
                    isPremium
                        ? parseInt(
                              process.env
                                  .PREMIUM_AUDIO_SONGS_PER_ARTIST as string,
                              10
                          )
                        : parseInt(
                              process.env.AUDIO_SONGS_PER_ARTIST as string,
                              10
                          )
                )
                .orderBy((eb) => eb.fn("CHAR_LENGTH", ["tags"]), "asc")
                .orderBy("views", "desc");

            const result = (await query.executeTakeFirst()) as QueriedSong;

            if (result) {
                resolve(result);
            } else {
                resolve(`${song.name} - ${song.artists[0]}`);
            }
        });
    }

    private refreshToken = async (): Promise<void> => {
        try {
            await this.refreshTokenInternal();
        } catch (e) {
            await retryWithExponentialBackoff(
                this.refreshTokenInternal,
                "Refreshing Spotify refresh token",
                5,
                5000
            );
        }
    };

    private refreshTokenInternal = async (): Promise<void> => {
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
            throw new Error(`Failed to refresh Spotify token. err = ${err}`);
        }
    };

    private async getPlaylistMetadata(
        playlistID: string
    ): Promise<PlaylistMetadata | null> {
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
                playlistID,
                playlistName,
                thumbnailUrl,
                snapshotID,
                limit,
                playlistLength: songCount,
                matchedSongsLength: 0,
            };
        } catch (err) {
            if (err.response?.status === 404) {
                logger.warn(
                    `Spotify playlist doesn't exist or is private. err = ${err}`
                );
            } else {
                logger.error(
                    `Failed fetching Spotify playlist metadata. err = ${err}`
                );
            }

            if (err.response) {
                logger.info(err.response.data);
                logger.info(err.response.status);
            }

            return null;
        }
    }
}
