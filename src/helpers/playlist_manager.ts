/* eslint-disable no-await-in-loop */
import { IPCLogger } from "../logger";
import {
    getDebugLogHeader,
    sendErrorMessage,
    sendInfoMessage,
} from "./discord_utils";
import { normalizePunctuationInName } from "../structures/game_round";
import {
    parseKmqPlaylistIdentifier,
    pathExists,
    retryJob,
    retryWithExponentialBackoff,
    standardDateFormat,
    visualProgressBar,
} from "./utils";
import { youtube_v3 } from "googleapis";
import Axios from "axios";
import KmqConfiguration from "../kmq_configuration";
import SongSelector from "../structures/song_selector";
import State from "../state";
import _ from "lodash";
import asyncPool from "tiny-async-pool";
import dbContext from "../database_context";
import fs from "fs";
import i18n from "./localization_manager";
import path from "path";
import type { AxiosResponse } from "axios";
import type { MatchedPlaylist } from "../interfaces/matched_playlist";
import type { PlaylistMetadata } from "../interfaces/playlist_metadata";
import type Eris from "eris";
import type MessageContext from "../structures/message_context";
import type QueriedSong from "../interfaces/queried_song";
import type SpotifyTrack from "../interfaces/spotify_track";

const logger = new IPCLogger("spotify_manager");

const BASE_URL = "https://api.spotify.com/v1";

const PLAYLIST_UNMATCHED_SONGS_DIR = path.join(
    __dirname,
    "../../data/spotify_unmatched_playlists",
);

const SONG_MATCH_TIMEOUT_MS = 90000;

export default class PlaylistManager {
    public cachedPlaylists: {
        [playlistID: string]: MatchedPlaylist;
    } = {};

    private youtubeClient: youtube_v3.Youtube | undefined;
    private accessToken: string | undefined;
    private guildsParseInProgress: { [guildID: string]: Date } = {};

    async start(): Promise<void> {
        await this.refreshSpotifyToken();
        this.youtubeClient = new youtube_v3.Youtube({
            auth: process.env.YOUTUBE_API_KEY,
        });

        setInterval(async () => {
            await this.refreshSpotifyToken();
        }, 3600000 * 0.8);
    }

    /**
     * @param guildID - The guild to check for
     * @returns whether a playlist is being parsed for the given guild
     */
    isParseInProgress(guildID: string): boolean {
        return !!this.guildsParseInProgress[guildID];
    }

    getMatchedPlaylistMetadata = async (
        guildID: string,
        kmqPlaylistIdentifier: string,
        forceRefreshMetadata: boolean,
        messageContext?: MessageContext,
        interaction?: Eris.CommandInteraction,
    ): Promise<PlaylistMetadata> => {
        const kmqPlaylistParsed = parseKmqPlaylistIdentifier(
            kmqPlaylistIdentifier,
        );

        const cachedPlaylist =
            this.cachedPlaylists[kmqPlaylistParsed.playlistId];

        if (cachedPlaylist) {
            return cachedPlaylist.metadata;
        }

        return (
            await State.playlistManager.getMatchedPlaylist(
                guildID,
                kmqPlaylistIdentifier,
                forceRefreshMetadata,
                messageContext,
                interaction,
            )
        ).metadata;
    };

    getMatchedPlaylist = async (
        guildID: string,
        kmqPlaylistIdentifier: string,
        forceRefreshMetadata: boolean,
        messageContext?: MessageContext,
        interaction?: Eris.CommandInteraction,
    ): Promise<MatchedPlaylist> => {
        const kmqPlaylistParsed = parseKmqPlaylistIdentifier(
            kmqPlaylistIdentifier,
        );

        const playlistId = kmqPlaylistParsed.playlistId;

        const UNMATCHED_PLAYLIST = {
            metadata: {
                playlistId,
                playlistName: "",
                playlistLength: 0,
                matchedSongsLength: 0,
                limit: 0,
                playlistChangeHash: "",
                thumbnailUrl: null,
            },
            matchedSongs: [],
            truncated: false,
            unmatchedSongs: [],
        };

        let logHeader: string;
        if (messageContext || interaction) {
            logHeader = `${getDebugLogHeader(
                (messageContext || interaction)!,
            )}, playlistID = ${playlistId}`;
        } else {
            logHeader = `guildID = ${guildID}. playlistID = ${playlistId}`;
        }

        if (this.isParseInProgress(guildID)) {
            if (messageContext) {
                logger.warn(
                    `${logHeader} | Skipping parsing due to another parse in progress`,
                );

                await sendErrorMessage(
                    messageContext,
                    {
                        title: i18n.translate(
                            messageContext.guildID,
                            "command.playlist.parsingAlreadyInProgress.title",
                        ),
                        description: i18n.translate(
                            messageContext.guildID,
                            "command.playlist.parsingAlreadyInProgress.description",
                        ),
                    },
                    interaction,
                );
            }

            return UNMATCHED_PLAYLIST;
        }

        return kmqPlaylistParsed.isSpotify
            ? this.getMatchedSpotifyPlaylist(
                  guildID,
                  playlistId,
                  forceRefreshMetadata,
                  messageContext,
                  interaction,
              )
            : this.getMatchedYoutubePlaylist(
                  guildID,
                  playlistId,
                  forceRefreshMetadata,
                  messageContext,
                  interaction,
              );
    };

    getMatchedYoutubePlaylist = async (
        guildID: string,
        playlistId: string,
        forceRefreshMetadata: boolean,
        messageContext?: MessageContext,
        interaction?: Eris.CommandInteraction,
    ): Promise<MatchedPlaylist> => {
        const UNMATCHED_PLAYLIST = {
            metadata: {
                playlistId,
                playlistName: "",
                playlistLength: 0,
                matchedSongsLength: 0,
                limit: 0,
                playlistChangeHash: "",
                thumbnailUrl: null,
            },
            matchedSongs: [],
            truncated: false,
            unmatchedSongs: [],
        };

        if (!this.youtubeClient) {
            logger.warn("YouTube API client not initialized, API key missing?");
            return UNMATCHED_PLAYLIST;
        }

        let logHeader: string;
        if (messageContext || interaction) {
            logHeader = `${getDebugLogHeader(
                (messageContext || interaction)!,
            )}, playlistID = ${playlistId}`;
        } else {
            logHeader = `guildID = ${guildID}. playlistID = ${playlistId}`;
        }

        let metadata: PlaylistMetadata | null;
        const cachedPlaylist = this.cachedPlaylists[playlistId];

        if (forceRefreshMetadata || !cachedPlaylist) {
            metadata = await this.getYoutubePlaylistMetadata(playlistId);
            logger.info(
                `${logHeader} | Refreshing YouTube metadata. forceRefreshMetadata: ${forceRefreshMetadata}, cachedPlaylist: ${!!cachedPlaylist}`,
            );
        } else {
            metadata = cachedPlaylist.metadata;
        }

        if (!metadata) {
            logger.warn(`${logHeader} | No YouTube metadata`);
            return UNMATCHED_PLAYLIST;
        }

        let matchedSongs: Array<QueriedSong> = [];
        let unmatchedSongs: Array<string>;
        let truncated = false;

        if (
            cachedPlaylist &&
            cachedPlaylist.metadata.playlistChangeHash ===
                metadata.playlistChangeHash
        ) {
            logger.info(`${logHeader} | Using cached playlist`);
            ({ matchedSongs, truncated, unmatchedSongs } = cachedPlaylist);
            metadata.matchedSongsLength = matchedSongs.length;
            return {
                matchedSongs,
                metadata,
                truncated,
                unmatchedSongs,
            };
        }

        this.guildsParseInProgress[guildID] = new Date();
        await interaction?.acknowledge();

        let pageToken: string | null | undefined = "";
        const songs: Array<{
            title: string;
            videoId: string;
        }> = [];

        let page = 0;
        // only first page of a mix playlist contains unique songs
        // they always start with an "RD".
        const isMixPlaylist = playlistId.startsWith("RD");
        const numPlaylistPages = isMixPlaylist
            ? 1
            : Math.ceil(metadata.playlistLength / 50);

        const parsingTitle = i18n.translate(
            guildID,
            "command.playlist.parsing",
        );

        let message: Eris.Message | null = null;
        if (interaction?.acknowledged) {
            message = await interaction.createFollowup({
                embeds: [
                    {
                        title: parsingTitle,
                        description: visualProgressBar(0, numPlaylistPages),
                    },
                ],
            });
        } else if (messageContext) {
            message = await sendInfoMessage(messageContext, {
                title: parsingTitle,
                description: visualProgressBar(0, numPlaylistPages),
            });
        }

        const updateParsing = setInterval(() => {
            try {
                message?.edit({
                    embeds: [
                        {
                            title: parsingTitle,
                            description: visualProgressBar(
                                page,
                                numPlaylistPages,
                            ),
                        },
                    ],
                });
            } catch (e) {
                logger.warn(
                    `Error editing getMatchedYoutubePlaylist inProgressParsingMessage. gid = ${message?.guildID}. e = ${e}`,
                );
            }
        }, 2000);

        const parseStartTime = Date.now();

        try {
            while (page < numPlaylistPages) {
                if (
                    page % Math.floor(numPlaylistPages / 4) === 0 ||
                    page === numPlaylistPages ||
                    page === 0
                ) {
                    logger.info(
                        `${logHeader} | Calling YouTube API ${page + 1}/${numPlaylistPages} for playlist`,
                    );
                }

                let resp: youtube_v3.Schema$PlaylistItemListResponse;

                try {
                    resp = (
                        await this.youtubeClient.playlistItems.list({
                            part: ["snippet"],
                            playlistId,
                            pageToken,
                            maxResults: 50,
                        })
                    ).data;
                } catch (e) {
                    logger.error(
                        `${logHeader} | Error calling client.playlistItems.list for ${playlistId}. err = ${e}`,
                    );
                    continue;
                }

                songs.push(
                    // eslint-disable-next-line no-unsafe-optional-chaining
                    ...resp.items!.map((x) => ({
                        title: x.snippet?.title as string,
                        videoId: x.snippet?.resourceId?.videoId as string,
                    })),
                );

                pageToken = resp.nextPageToken;
                if (!pageToken) break;
                page++;
            }

            // playlist length might differ from actual number of songs in the playlist
            // e.g: mix playlists always returning 5 instead of actual size
            metadata.playlistLength = songs.length;

            try {
                message?.edit({
                    embeds: [
                        {
                            title: parsingTitle,
                            description: visualProgressBar(1, 1),
                        },
                    ],
                });
            } catch (e) {
                logger.warn(
                    `Error editing getMatchedYoutubePlaylist finishParsingMessage. gid = ${message?.guildID}. e = ${e}`,
                );
            }

            const youtubePlaylistVideoIDs: {
                videoId: string;
                title: string;
            }[] = songs.map((x) => ({
                videoId: x.videoId,
                title: x.title,
            }));

            // Get list of vids with parent vid if possible.
            const duplicateToMainVideoMapping = await dbContext.kpopVideos
                .selectFrom("app_kpop as a")
                .rightJoin("app_kpop as b", "a.id_parent", "b.id")
                .select(["a.vlink as duplicate_link", "b.vlink as main_link"])
                .where(
                    "a.vlink",
                    "in",
                    youtubePlaylistVideoIDs.map((x) => x.videoId),
                )
                .execute();

            // Replace duplicate links with main links.
            for (const duplicate of duplicateToMainVideoMapping) {
                for (const original of youtubePlaylistVideoIDs) {
                    if (original.videoId === duplicate.duplicate_link) {
                        original.videoId = duplicate.main_link;
                    }
                }
            }

            // Match songs with vlinks
            matchedSongs = await dbContext.kmq
                .selectFrom("available_songs")
                .select(SongSelector.QueriedSongFields)
                .where((eb) =>
                    eb.or([
                        eb(
                            "link",
                            "in",
                            youtubePlaylistVideoIDs.map((x) => x.videoId),
                        ),
                        eb(
                            "original_link",
                            "in",
                            youtubePlaylistVideoIDs.map((x) => x.videoId),
                        ),
                    ]),
                )
                .execute();

            unmatchedSongs = youtubePlaylistVideoIDs
                .filter(
                    (x) =>
                        !matchedSongs
                            .flatMap((y) =>
                                y.originalLink
                                    ? [y.originalLink, y.youtubeLink]
                                    : [y.youtubeLink],
                            )
                            .includes(x.videoId),
                )
                .map((x) => `${x.title} (${x.videoId})`);
        } finally {
            clearInterval(updateParsing);
            delete this.guildsParseInProgress[guildID];
        }

        metadata.matchedSongsLength = matchedSongs.length;

        if (unmatchedSongs.length) {
            if (!(await pathExists(PLAYLIST_UNMATCHED_SONGS_DIR))) {
                await fs.promises.mkdir(PLAYLIST_UNMATCHED_SONGS_DIR);
            }

            const playlistUnmatchedSongsPath = path.resolve(
                __dirname,
                PLAYLIST_UNMATCHED_SONGS_DIR,
                `${playlistId}-${standardDateFormat(new Date())}.txt`,
            );

            await fs.promises.writeFile(
                playlistUnmatchedSongsPath,
                unmatchedSongs.join("\n"),
            );
        }

        if (KmqConfiguration.Instance.persistMatchedPlaylistSongs()) {
            await fs.promises.writeFile(
                path.resolve(
                    PLAYLIST_UNMATCHED_SONGS_DIR,
                    `${playlistId}-${standardDateFormat(
                        new Date(),
                    )}.matched.txt`,
                ),
                matchedSongs
                    .map((x) => `${x.songName} - ${x.artistName}`)
                    .join("\n"),
            );
        }

        logger.info(
            `${logHeader} | Finished parsing playlist after ${
                Date.now() - parseStartTime
            }ms.`,
        );

        const playlist: MatchedPlaylist = {
            matchedSongs,
            metadata,
            truncated,
            unmatchedSongs,
        };

        this.cachedPlaylists[playlistId] = playlist;
        return playlist;
    };

    /**
     * @param guildID - The guild to retrieve songs for
     * @param playlistId - The playlist to retrieve songs from
     * @param forceRefreshMetadata - Whether to request new metadata
     * @param messageContext - The message context
     * @param interaction - The interaction
     */
    getMatchedSpotifyPlaylist = async (
        guildID: string,
        playlistId: string,
        forceRefreshMetadata: boolean,
        messageContext?: MessageContext,
        interaction?: Eris.CommandInteraction,
    ): Promise<MatchedPlaylist> => {
        const UNMATCHED_PLAYLIST = {
            metadata: {
                playlistId,
                playlistName: "",
                playlistLength: 0,
                matchedSongsLength: 0,
                limit: 0,
                playlistChangeHash: "",
                thumbnailUrl: null,
            },
            matchedSongs: [],
            truncated: false,
            unmatchedSongs: [],
        };

        let logHeader: string;
        if (messageContext || interaction) {
            logHeader = `${getDebugLogHeader(
                (messageContext || interaction)!,
            )}, playlistID = ${playlistId}`;
        } else {
            logHeader = `guildID = ${guildID}. playlistID = ${playlistId}`;
        }

        if (
            !process.env.SPOTIFY_CLIENT_ID ||
            !process.env.SPOTIFY_CLIENT_SECRET
        ) {
            logger.warn(
                `${logHeader} | No songs matched due to missing Spotify client ID or secret`,
            );
            return UNMATCHED_PLAYLIST;
        }

        const cachedPlaylist = this.cachedPlaylists[playlistId];
        let metadata: PlaylistMetadata | null;
        if (forceRefreshMetadata || !cachedPlaylist) {
            metadata = await this.getSpotifyPlaylistMetadata(playlistId);
            logger.info(
                `${logHeader} | Refreshing Spotify metadata. forceRefreshMetadata: ${forceRefreshMetadata}, cachedPlaylist: ${!!cachedPlaylist}`,
            );
        } else {
            metadata = cachedPlaylist.metadata;
        }

        if (!metadata) {
            logger.warn(`${logHeader} | No Spotify metadata`);
            return UNMATCHED_PLAYLIST;
        }

        let matchedSongs: Array<QueriedSong> = [];
        let unmatchedSongs: Array<string> = [];
        let truncated = false;

        if (
            cachedPlaylist &&
            cachedPlaylist.metadata.playlistChangeHash ===
                metadata.playlistChangeHash
        ) {
            logger.info(`${logHeader} | Using cached playlist`);
            ({ matchedSongs, truncated, unmatchedSongs } = cachedPlaylist);
            metadata.matchedSongsLength = matchedSongs.length;

            return {
                matchedSongs,
                metadata,
                truncated,
                unmatchedSongs,
            };
        }

        this.guildsParseInProgress[guildID] = new Date();
        await interaction?.acknowledge();

        const spotifySongs: Array<SpotifyTrack> = [];
        const start = Date.now();
        logger.info(`${logHeader} | Using Spotify API for playlist`);

        const numPlaylistPages = Math.ceil(
            metadata.playlistLength / metadata.limit,
        );

        const requestURLs = [...Array(numPlaylistPages).keys()].map(
            (n) =>
                `${BASE_URL}/playlists/${playlistId}/tracks?${encodeURI(
                    `market=US&fields=items(track(name,artists(name))),next&limit=${
                        metadata!.limit
                    }&offset=${n * metadata!.limit}`,
                )}`,
        );

        let numProcessedPlaylistPages = 0;
        const parseStartTime = Date.now();
        for await (const results of asyncPool(
            10,
            requestURLs,
            (requestURL: string) =>
                this.generateSpotifyResponsePromise(requestURL, guildID),
        )) {
            if (
                numProcessedPlaylistPages % Math.floor(numPlaylistPages / 4) ===
                    0 ||
                numProcessedPlaylistPages === numPlaylistPages ||
                numProcessedPlaylistPages === 0
            ) {
                logger.info(
                    `${logHeader} | Calling Spotify API ${numProcessedPlaylistPages + 1}/${numPlaylistPages} for playlist`,
                );
            }

            spotifySongs.push(...results);
            numProcessedPlaylistPages++;
        }

        logger.info(
            `${logHeader} | Finished grabbing Spotify song data for playlist after ${
                Date.now() - start
            }ms`,
        );

        logger.info(
            `${logHeader} | Starting to parse playlist, number of songs: ${spotifySongs.length}`,
        );

        const parsingTitle = i18n.translate(
            guildID,
            "command.playlist.parsing",
        );

        let message: Eris.Message | null = null;
        if (interaction?.acknowledged) {
            message = await interaction.createFollowup({
                embeds: [
                    {
                        title: parsingTitle,
                        description: visualProgressBar(0, spotifySongs.length),
                    },
                ],
            });
        } else if (messageContext) {
            message = await sendInfoMessage(messageContext, {
                title: parsingTitle,
                description: visualProgressBar(0, spotifySongs.length),
            });
        }

        const updateParsing = setInterval(() => {
            try {
                message?.edit({
                    embeds: [
                        {
                            title: parsingTitle,
                            description: visualProgressBar(
                                unmatchedSongs.length + matchedSongs.length,
                                spotifySongs.length,
                            ),
                        },
                    ],
                });
            } catch (e) {
                logger.warn(
                    `Error editing getMatchedSpotifyPlaylist inProgressParsingMessage. gid = ${message?.guildID}. e = ${e}`,
                );
            }
        }, 2000);

        try {
            for await (const queryOutput of asyncPool(
                4,
                spotifySongs,
                (x: SpotifyTrack) =>
                    this.generateSpotifySongMatchingPromise(x, guildID),
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
                        `${logHeader} | Processed ${processedSongCount}/${spotifySongs.length} for playlist`,
                    );
                }

                if (Date.now() - parseStartTime > SONG_MATCH_TIMEOUT_MS) {
                    logger.warn(
                        `${logHeader} | Playlist exceeded song match timeout of ${SONG_MATCH_TIMEOUT_MS}ms after processing ${processedSongCount}/${spotifySongs.length}`,
                    );
                    truncated = true;
                    break;
                }
            }

            logger.info(
                `${logHeader} | Finished parsing playlist after ${
                    Date.now() - parseStartTime
                }ms.`,
            );
        } finally {
            clearInterval(updateParsing);
            delete this.guildsParseInProgress[guildID];
        }

        try {
            message?.edit({
                embeds: [
                    {
                        title: parsingTitle,
                        description: visualProgressBar(1, 1),
                    },
                ],
            });
        } catch (e) {
            logger.warn(
                `Error editing getMatchedSpotifyPlaylist finishParsingMessage. gid = ${message?.guildID}. e = ${e}}`,
            );
        }

        matchedSongs = _.uniqBy(matchedSongs, "youtubeLink");
        unmatchedSongs = _.uniq(unmatchedSongs);
        metadata.matchedSongsLength = matchedSongs.length;

        if (unmatchedSongs.length) {
            if (!(await pathExists(PLAYLIST_UNMATCHED_SONGS_DIR))) {
                await fs.promises.mkdir(PLAYLIST_UNMATCHED_SONGS_DIR);
            }

            const playlistUnmatchedSongsPath = path.resolve(
                __dirname,
                PLAYLIST_UNMATCHED_SONGS_DIR,
                `${playlistId}-${standardDateFormat(new Date())}.txt`,
            );

            await fs.promises.writeFile(
                playlistUnmatchedSongsPath,
                unmatchedSongs.join("\n"),
            );
        }

        if (KmqConfiguration.Instance.persistMatchedPlaylistSongs()) {
            await fs.promises.writeFile(
                path.resolve(
                    PLAYLIST_UNMATCHED_SONGS_DIR,
                    `${playlistId}-${standardDateFormat(
                        new Date(),
                    )}.matched.txt`,
                ),
                matchedSongs
                    .map((x) => `${x.songName} - ${x.artistName}`)
                    .join("\n"),
            );
        }

        const playlist: MatchedPlaylist = {
            metadata,
            matchedSongs,
            truncated,
            unmatchedSongs,
        };

        this.cachedPlaylists[playlistId] = playlist;
        return playlist;
    };

    /**
     * Remove any guilds that have been stuck parsing for more than 10 minutes
     */
    cleanupPlaylistParsingLocks(): void {
        for (const guildID in this.guildsParseInProgress) {
            if (
                this.guildsParseInProgress[guildID] <
                new Date(Date.now() - 1000 * 60 * 10)
            ) {
                logger.warn(
                    `Guild ${guildID} got stuck parsing Playlist at ${this.guildsParseInProgress[guildID]}`,
                );
                delete this.guildsParseInProgress[guildID];
            }
        }
    }

    private generateSpotifyResponsePromise(
        requestURL: string,
        guildID: string,
    ): Promise<Array<SpotifyTrack>> {
        return new Promise(async (resolve, reject) => {
            try {
                const spotifyRequest = async (
                    url: string,
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
                        `Spotify rate limit exceeded, waiting ${rateLimit} seconds...`,
                    );

                    response = await retryJob(
                        spotifyRequest,
                        [requestURL],
                        1,
                        false,
                        rateLimit,
                    );
                }

                if (!response.data.items) {
                    throw new Error(
                        `Received unexpected response from Spotify. responseCode = ${response.status}. response.data = ${response.data}`,
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
                            },
                        ) => {
                            let parsedSong: SpotifyTrack;
                            try {
                                parsedSong = {
                                    name: song.track.name,
                                    artists: song.track.artists.map(
                                        (artist: { name: string }) =>
                                            artist.name,
                                    ),
                                };
                            } catch (err) {
                                logger.warn(
                                    `Failed parsing song. song = ${JSON.stringify(
                                        song,
                                    )}. err = ${err}`,
                                );
                                return songs;
                            }

                            songs.push(parsedSong);
                            return songs;
                        },
                        [],
                    ),
                );
            } catch (err) {
                logger.error(`Failed fetching Spotify playlist. err = ${err}`);

                if (err.response) {
                    logger.error(err.response.data);
                    logger.error(err.response.status);
                }

                delete this.guildsParseInProgress[guildID];
                reject(err);
            }
        });
    }

    private generateSpotifySongMatchingPromise(
        song: SpotifyTrack,
        guildID: string,
    ): Promise<QueriedSong | string> {
        return new Promise(async (resolve, reject) => {
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
                                    State.artistToEntry[lowercaseAlias].id,
                                );
                            }
                        }
                    }
                }
            }

            // handle songs with brackets in name, consider all components separately
            const songNameBracketComponents = song.name.split("(");
            const songNames = [songNameBracketComponents[0].trim()];
            if (songNameBracketComponents.length > 1) {
                songNames.push(
                    songNameBracketComponents[1].replace(")", "").trim(),
                );
                songNames.push(song.name);
            }

            const query = dbContext.kmq
                .selectFrom("available_songs")
                .leftJoin(
                    "kpop_videos.app_kpop_group as a",
                    "a.id",
                    "available_songs.id_artist",
                )
                .leftJoin(
                    "kpop_videos.app_kpop_group as b",
                    "b.id",
                    "available_songs.id_parent_artist",
                )
                .select(SongSelector.QueriedSongFields)
                .where(({ eb, or }) =>
                    or(
                        songNames.map((songName) =>
                            eb(
                                "available_songs.clean_song_name_alpha_numeric",
                                "like",
                                songName.replace(/[^0-9a-z]/gi, "") || songName,
                            ),
                        ),
                    ),
                )
                .where(({ or, eb, and }) => {
                    const expressions = [
                        eb(
                            "available_songs.original_artist_name_en",
                            "like",
                            song.artists[0],
                        ),
                        and([
                            eb(
                                "available_songs.original_artist_name_en",
                                "like",
                                "%+%",
                            ),
                            eb(
                                "available_songs.original_artist_name_en",
                                "like",
                                `%${song.artists[0]}%`,
                            ),
                        ]),
                        eb(
                            "available_songs.previous_name_en",
                            "like",
                            song.artists[0],
                        ),
                        eb("artist_aliases", "like", `%${song.artists[0]}%`),
                    ];

                    if (aliasIDs.length) {
                        expressions.push(
                            ...[
                                eb("a.id_parentgroup", "in", aliasIDs),
                                eb("id_artist", "in", aliasIDs),
                                eb("id_parent_artist", "in", aliasIDs),
                            ],
                        );
                    }

                    return or(expressions);
                })
                .orderBy((eb) => eb.fn("CHAR_LENGTH", ["tags"]), "asc")
                .orderBy("views", "desc");

            try {
                const results = await query.execute();
                let result: QueriedSong | null = null;
                if (results.length === 1) {
                    result = results[0];
                } else if (results.length > 1) {
                    // prioritize pre-bracket name
                    const properNameMatch = results.find(
                        (x) =>
                            x.songName
                                .toLowerCase()
                                .replace(/[^0-9a-z]/gi, "") ===
                            songNames[0]
                                .toLowerCase()
                                .replace(/[^0-9a-z]/gi, ""),
                    );

                    result = properNameMatch || results[0];
                }

                if (result) {
                    resolve(result);
                } else {
                    resolve(`"${song.name}" - ${song.artists.join(", ")}`);
                }
            } catch (err) {
                logger.error(
                    `Failed matching Spotify song. song = ${JSON.stringify(
                        song,
                    )}. err = ${err}`,
                );

                delete this.guildsParseInProgress[guildID];
                reject(err);
            }
        });
    }

    private refreshSpotifyToken = async (): Promise<void> => {
        try {
            await this.refreshSpotifyTokenInternal();
        } catch (e) {
            await retryWithExponentialBackoff(
                this.refreshSpotifyTokenInternal,
                "Refreshing Spotify refresh token",
                5,
                5000,
            );
        }
    };

    private refreshSpotifyTokenInternal = async (): Promise<void> => {
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
                        `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`,
                    ).toString("base64")}`,
                    "Content-Type": "application/x-www-form-urlencoded",
                },
            });

            this.accessToken = resp.data.access_token;
        } catch (err) {
            throw new Error(`Failed to refresh Spotify token. err = ${err}`);
        }
    };

    private async getYoutubePlaylistMetadata(
        playlistId: string,
    ): Promise<PlaylistMetadata | null> {
        if (!this.youtubeClient) {
            logger.warn("YouTube API client not initialized, API key missing?");
            return null;
        }

        let response: youtube_v3.Schema$PlaylistListResponse;

        try {
            response = (
                await this.youtubeClient.playlists.list({
                    part: ["snippet", "contentDetails"],
                    id: [playlistId],
                })
            ).data;
        } catch (e) {
            logger.error(
                `Error calling client.playlists.list for ${playlistId}. err = e`,
            );
            return null;
        }

        const playlistResponse = response.items;
        if (!playlistResponse) {
            logger.error(
                `Unable to fetch playlist metadata for ${playlistId}. resp = ${JSON.stringify(
                    response,
                )}`,
            );
            logger.error(`${playlistId} | ${JSON.stringify(response)}`);
            return null;
        }

        if (playlistResponse.length === 0) {
            logger.warn(`Could not find playlist metadata for ${playlistId}`);
            return null;
        }

        const playlistName = playlistResponse[0].snippet!.title as string;
        const playlistChangeHash = response.etag as string;
        const thumbnailUrl = playlistResponse[0].snippet!.thumbnails?.default
            ?.url as string;

        const limit = response.pageInfo!.resultsPerPage as number;
        const songCount = playlistResponse[0].contentDetails!
            .itemCount as number;

        return {
            playlistId,
            playlistName,
            thumbnailUrl,
            playlistChangeHash,
            limit,
            playlistLength: songCount,
            matchedSongsLength: 0,
        };
    }

    private async getSpotifyPlaylistMetadata(
        playlistId: string,
    ): Promise<PlaylistMetadata | null> {
        const requestURL = `${BASE_URL}/playlists/${playlistId}`;

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
            const playlistChangeHash = response.snapshot_id;
            let thumbnailUrl: string | null = null;
            if (response.images.length > 0) {
                thumbnailUrl = response.images[0].url;
            }

            const limit = response.tracks.limit;
            const songCount = response.tracks.total;

            return {
                playlistId,
                playlistName,
                thumbnailUrl,
                playlistChangeHash,
                limit,
                playlistLength: songCount,
                matchedSongsLength: 0,
            };
        } catch (err) {
            if (err.response?.status === 404) {
                logger.warn(
                    `Spotify playlist doesn't exist or is private. err = ${err}`,
                );
            } else {
                logger.error(
                    `Failed fetching Spotify playlist metadata. err = ${err}`,
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
