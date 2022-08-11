/* eslint-disable no-await-in-loop */
import { IPCLogger } from "../logger";
import { cleanArtistName, cleanSongName } from "../structures/game_round";
import Axios from "axios";
import SongSelector from "../structures/song_selector";
import _ from "lodash";
import dbContext from "../database_context";
import type QueriedSong from "../interfaces/queried_song";

const logger = new IPCLogger("spotify_manager");

interface SpotifyTrack {
    name: string;
    artists: Array<string>;
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
    ): Promise<Array<QueriedSong>> => {
        if (
            !process.env.SPOTIFY_CLIENT_ID ||
            !process.env.SPOTIFY_CLIENT_SECRET
        ) {
            return [];
        }

        const spotifySongs: Array<SpotifyTrack> = [];
        let requestURL = `https://api.spotify.com/v1/playlists/${playlistID}/tracks?${encodeURI(
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
                logger.error(`Failed fetching patrons. err = ${err}`);

                if (err.response) {
                    logger.info(err.response.data);
                    logger.info(err.response.status);
                }

                break;
            }
        } while (requestURL);

        const matchedSongs: Array<QueriedSong> = [];
        for (const song of spotifySongs) {
            const result = (await dbContext
                .kmq("available_songs")
                .join(
                    "kpop_groups",
                    "available_songs.id_artist",
                    "kpop_groups.id"
                )
                .select([
                    ...SongSelector.getQueriedSongFields(),
                    "alphanumeric_song_name_en",
                    "alphanumeric_artist_name_en",
                ])
                .where(
                    "alphanumeric_song_name_en",
                    "=",
                    cleanSongName(song.name)
                )
                .andWhere(
                    "alphanumeric_artist_name_en",
                    "=",
                    cleanArtistName(song.artists[0])
                )
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
            } else {
                logger.info(`${song.name} - ${song.artists[0]}`);
            }
        }

        return _.uniq(matchedSongs);
    };

    private refreshToken = async (): Promise<void> => {
        if (
            !process.env.SPOTIFY_CLIENT_ID ||
            !process.env.SPOTIFY_CLIENT_SECRET
        ) {
            return;
        }

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
}
