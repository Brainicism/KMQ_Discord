/* eslint-disable no-await-in-loop */
import { IPCLogger } from "../logger";
import Axios from "axios";
import SongSelector from "../structures/song_selector";
import State from "../state";
import _ from "lodash";
import dbContext from "../database_context";
import type QueriedSong from "../interfaces/queried_song";

const logger = new IPCLogger("spotify_manager");

const BASE_URL = "https://api.spotify.com/v1";

interface SpotifyTrack {
    name: string;
    artists: Array<string>;
}

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

        const spotifySongs: Array<SpotifyTrack> = [];
        let requestURL = `${BASE_URL}/playlists/${playlistID}/tracks?${encodeURI(
            "market=US&fields=items(track(name,artists(name))),next&limit=50"
        )}`;

        do {
            try {
                const response = (
                    await Axios.get(requestURL, {
                        headers: {
                            Authorization: `Bearer ${this.accessToken}`,
                            "Content-Type": "application/x-www-form-urlencoded",
                        },
                    })
                ).data;

                for (const item of response.items) {
                    spotifySongs.push({
                        name: item.track.name,
                        artists: item.track.artists.map(
                            (x: { name: string }) => x.name
                        ),
                    });
                }

                requestURL = response.next;
            } catch (err) {
                logger.error(`Failed fetching Spotify playlist. err = ${err}`);

                if (err.response) {
                    logger.info(err.response.data);
                    logger.info(err.response.status);
                }

                break;
            }
        } while (requestURL);

        let matchedSongs: Array<QueriedSong> = [];
        for (const song of spotifySongs) {
            const aliasIDs = [];
            for (const artist of song.artists) {
                const lowercaseArtist = artist.toLocaleLowerCase();
                const artistMapping = State.artistToEntry[lowercaseArtist];
                if (artistMapping) {
                    aliasIDs.push(artistMapping.id);
                    if (State.aliases.artist[lowercaseArtist]) {
                        for (const alias of State.aliases.artist[
                            lowercaseArtist
                        ]) {
                            aliasIDs.push(State.artistToEntry[alias].id);
                        }
                    }
                }
            }

            const result = (await dbContext
                .kmq("available_songs")
                .join(
                    "kpop_groups",
                    "available_songs.id_artist",
                    "kpop_groups.id"
                )
                .select(SongSelector.getQueriedSongFields())
                .where((qb) => {
                    qb.whereRaw("available_songs.song_name_en SOUNDS LIKE ?", [
                        song.name,
                    ]);
                })
                .andWhere((qb) => {
                    qb.whereRaw(
                        "available_songs.artist_name_en SOUNDS LIKE ?",
                        [song.artists[0]]
                    )
                        .orWhereIn("id_artist", aliasIDs)
                        .orWhereIn("id_parentgroup", aliasIDs);
                })
                .andWhere(
                    "rank",
                    "<=",
                    isPremium
                        ? process.env.PREMIUM_AUDIO_SONGS_PER_ARTIST
                        : process.env.AUDIO_SONGS_PER_ARTIST
                )
                .first()) as QueriedSong;

            if (result) {
                matchedSongs.push(result);
            }
        }

        const spotifyMetadata = await this.getPlaylistMetadata(playlistID);
        matchedSongs = _.uniq(matchedSongs);
        return {
            matchedSongs,
            metadata: {
                playlistID,
                playlistLength: spotifySongs.length,
                playlistName: spotifyMetadata.playlistName,
                matchedSongsLength: matchedSongs.length,
                thumbnailUrl: spotifyMetadata.thumbnailUrl,
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

    private async getPlaylistMetadata(
        playlistID: string
    ): Promise<{ playlistName: string; thumbnailUrl: string }> {
        const requestURL = `${BASE_URL}/playlists/${playlistID}`;
        let thumbnailUrl: string;
        let playlistName: string;
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
        }

        return { playlistName, thumbnailUrl };
    }
}
