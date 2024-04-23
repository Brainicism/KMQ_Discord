import {
    BOOKMARK_BUTTON_PREFIX,
    CLIP_LAST_REPLAY_DELAY_MS,
    CLIP_MAX_REPLAY_COUNT,
    CLIP_PADDING_BEGINNING_MS,
    CLIP_VC_END_TIMEOUT_MS,
    KmqImages,
    SKIP_BUTTON_PREFIX,
    specialFfmpegArgs,
} from "../constants";
import { IPCLogger } from "../logger";
import {
    clickableSlashCommand,
    generateEmbed,
    getCurrentVoiceMembers,
    getDebugLogHeader,
    sendBookmarkedSongs,
    sendErrorMessage,
    sendInfoMessage,
    tryCreateInteractionErrorAcknowledgement,
    tryCreateInteractionSuccessAcknowledgement,
    tryInteractionAcknowledge,
} from "../helpers/discord_utils";
import {
    delay,
    friendlyFormattedNumber,
    getMention,
    truncatedString,
    underline,
} from "../helpers/utils";
import { ensureVoiceConnection } from "../helpers/game_utils";
import { sql } from "kysely";
import ClipAction from "../enums/clip_action";
import EnvVariableManager from "../env_variable_manager";
import Eris from "eris";
import FactGenerator from "../fact_generator";
import GameRound from "./game_round";
import GuessModeType from "../enums/option_types/guess_mode_type";
import KmqConfiguration from "../kmq_configuration";
import ListeningRound from "./listening_round";
import LocaleType from "../enums/locale_type";
import MessageContext from "./message_context";
import SeekType from "../enums/option_types/seek_type";
import SongSelector from "./song_selector";
import State from "../state";
import dbContext from "../database_context";
import fs from "fs";
import i18n from "../helpers/localization_manager";
import type BookmarkedSong from "../interfaces/bookmarked_song";
import type ClipGameRound from "./clip_game_round";
import type EmbedPayload from "../interfaces/embed_payload";
import type GameSession from "./game_session";
import type GuildPreference from "./guild_preference";
import type KmqMember from "./kmq_member";
import type ListeningSession from "./listening_session";
import type QueriedSong from "./queried_song";
import type Round from "./round";

const logger = new IPCLogger("session");

export default abstract class Session {
    /** The ID of text channel in which the Session was started in, and will be active in */
    public readonly textChannelID: string;

    /** The Discord Guild ID */
    public readonly guildID: string;

    /** The time the Session was started in epoch milliseconds */
    public readonly startedAt: number;

    /** The ID of the voice channel in which the Session was started in, and will be active in */
    public voiceChannelID: string;

    /** Initially the user who started the Session, transferred to current VC member */
    public owner: KmqMember;

    /** The current active Eris.VoiceConnection */
    public connection: Eris.VoiceConnection | undefined;

    /** The last time of activity in epoch milliseconds, used to track inactive sessions  */
    public lastActive: number;

    /** The current Round */
    public round: Round | null;

    /** Whether the Session has ended or not */
    public finished: boolean;

    /** Whether the Session is active yet */
    public sessionInitialized: boolean;

    /** The guild preference */
    protected guildPreference: GuildPreference;

    /** The number of Rounds played */
    protected roundsPlayed: number;

    /** Mapping of user ID to bookmarked songs, uses Map since Set doesn't remove QueriedSong duplicates */
    private bookmarkedSongs: {
        [userID: string]: Map<string, BookmarkedSong>;
    };

    /** Timer function used to for /timer command */
    private guessTimeoutFunc: NodeJS.Timer | undefined;

    constructor(
        guildPreference: GuildPreference,
        textChannelID: string,
        voiceChannelID: string,
        guildID: string,
        sessionCreator: KmqMember,
    ) {
        this.guildPreference = guildPreference;
        this.textChannelID = textChannelID;
        this.voiceChannelID = voiceChannelID;
        this.guildID = guildID;
        this.owner = sessionCreator;
        this.lastActive = Date.now();
        this.startedAt = Date.now();
        this.finished = false;
        this.round = null;
        this.sessionInitialized = false;
        this.roundsPlayed = 0;
        this.bookmarkedSongs = {};
        this.guildPreference.songSelector.resetSessionState();
    }

    abstract sessionName(): string;

    static getSession(guildID: string): Session | undefined {
        return State.gameSessions[guildID] ?? State.listeningSessions[guildID];
    }

    /**
     * Deletes the Session corresponding to a given guild ID
     * @param guildID - The guild ID
     */
    static deleteSession(guildID: string): void {
        const isGameSession = guildID in State.gameSessions;
        const isListeningSession = guildID in State.listeningSessions;
        if (!isGameSession && !isListeningSession) {
            logger.info(`gid: ${guildID} | Session already ended`);
            return;
        }

        if (isGameSession) {
            delete State.gameSessions[guildID];
        } else if (isListeningSession) {
            delete State.listeningSessions[guildID];
        }
    }

    isListeningSession(): this is ListeningSession {
        return false;
    }

    isGameSession(): this is GameSession {
        return false;
    }

    /**
     * Starting a new Round
     * @param messageContext - An object containing relevant parts of Eris.Message
     */
    async startRound(messageContext: MessageContext): Promise<Round | null> {
        if (!this.sessionInitialized) {
            logger.info(
                `${getDebugLogHeader(
                    messageContext,
                )} | ${this.sessionName()} starting`,
            );
        }

        if (KmqConfiguration.Instance.maintenanceModeEnabled()) {
            logger.warn(
                `${getDebugLogHeader(
                    messageContext,
                )} | Session ending due to maintenance mode `,
            );
            await this.endSession("Maintenance mode enabled", true);
            return null;
        }

        this.sessionInitialized = true;
        if (this.guildPreference.songSelector.getSongs().songs.size === 0) {
            try {
                await this.guildPreference.songSelector.reloadSongs(
                    !this.sessionInitialized,
                );
            } catch (err) {
                await sendErrorMessage(messageContext, {
                    title: i18n.translate(
                        this.guildID,
                        "misc.failure.errorSelectingSong.title",
                    ),
                    description: i18n.translate(
                        this.guildID,
                        "misc.failure.errorSelectingSong.description",
                    ),
                });

                logger.error(
                    `${getDebugLogHeader(
                        messageContext,
                    )} | Error querying song: ${err.toString()}. guildPreference = ${JSON.stringify(
                        this.guildPreference,
                    )}`,
                );
                await this.endSession("Error reloading songs", true);
                return null;
            }
        }

        if (this.guildPreference.songSelector.checkUniqueSongQueue()) {
            const totalSongCount =
                this.guildPreference.songSelector.getCurrentSongCount();

            logger.info(
                `${getDebugLogHeader(
                    messageContext,
                )} | Resetting uniqueSongsPlayed (all ${totalSongCount} unique songs played)`,
            );

            await sendInfoMessage(messageContext, {
                title: i18n.translate(
                    this.guildID,
                    "misc.uniqueSongsReset.title",
                ),
                description: i18n.translate(
                    this.guildID,
                    "misc.uniqueSongsReset.description",
                    { totalSongCount: friendlyFormattedNumber(totalSongCount) },
                ),
                thumbnailUrl: KmqImages.LISTENING,
            });
        }

        this.guildPreference.songSelector.checkAlternatingGender();
        const randomSong = this.guildPreference.songSelector.queryRandomSong();

        if (randomSong === null) {
            await sendErrorMessage(messageContext, {
                title: i18n.translate(
                    this.guildID,
                    "misc.failure.songQuery.title",
                ),
                description: i18n.translate(
                    this.guildID,
                    "misc.failure.songQuery.description",
                ),
            });
            await this.endSession("Error querying random song", true);
            return null;
        }

        // create a new round with randomly chosen song
        const round = this.prepareRound(randomSong);
        this.round = round;

        const voiceChannel = State.client.getChannel(
            this.voiceChannelID,
        ) as Eris.VoiceChannel | null;

        if (!voiceChannel || voiceChannel.voiceMembers.size === 0) {
            await this.endSession(
                "Voice channel is empty, during startRound",
                false,
            );
            return null;
        }

        // join voice channel and start round
        try {
            await ensureVoiceConnection(State.client, this);
        } catch (err) {
            await this.endSession("Unable to obtain voice connection", true);
            logger.error(
                `${getDebugLogHeader(
                    messageContext,
                )} | Error obtaining voice connection. err = ${err.toString()}`,
            );

            await sendErrorMessage(messageContext, {
                title: i18n.translate(
                    this.guildID,
                    "misc.failure.vcJoin.title",
                ),
                description: i18n.translate(
                    this.guildID,
                    "misc.failure.vcJoin.description",
                ),
            });
            return null;
        }

        const voiceConnectionSuccess = await this.playSong(
            messageContext,
            round,
        );

        return voiceConnectionSuccess ? this.round : null;
    }

    /**
     * Ends an active Round
     * @param _messageContext - unused
     * @param _isError - unused
     */
    // eslint-disable-next-line @typescript-eslint/require-await
    async endRound(
        isError: boolean,
        _messageContext?: MessageContext,
    ): Promise<void> {
        if (this.round === null) {
            return;
        }

        this.round = null;

        // cleanup
        this.stopGuessTimeout();

        if (this.finished) return;
        this.roundsPlayed++;
        // check if duration has been reached
        const remainingDuration = this.getRemainingDuration(
            this.guildPreference,
        );

        if (remainingDuration && remainingDuration < 0) {
            logger.info(`gid: ${this.guildID} | Game session duration reached`);
            await this.endSession("Game session duration reached", isError);
        }
    }

    /**
     * Ends the current Session
     * @param reason - The reason for the session end
     * @param endedDueToError - Whether the session ended due to an error
     */
    async endSession(reason: string, endedDueToError: boolean): Promise<void> {
        logger.info(
            `gid: ${this.guildID} | Session ended. endedDueToError: ${endedDueToError}. Reason: ${reason}`,
        );

        Session.deleteSession(this.guildID);
        await this.endRound(
            false,
            new MessageContext(this.textChannelID, null, this.guildID),
        );

        const voiceConnection = State.client.voiceConnections.get(this.guildID);

        // leave voice channel
        if (voiceConnection && voiceConnection.channelID) {
            voiceConnection.stopPlaying();
            const voiceChannel = State.client.getChannel(
                voiceConnection.channelID,
            ) as Eris.VoiceChannel | null;

            if (voiceChannel) {
                try {
                    voiceChannel.leave();
                } catch (e) {
                    logger.error(
                        `Failed to disconnect inactive voice connection for gid: ${this.guildID}. err = ${e}`,
                    );
                }
            }
        }

        // DM bookmarked songs
        const bookmarkedSongsPlayerCount = Object.keys(
            this.bookmarkedSongs,
        ).length;

        if (bookmarkedSongsPlayerCount > 0) {
            const bookmarkedSongCount = Object.values(
                this.bookmarkedSongs,
            ).reduce((total, x) => total + x.size, 0);

            await sendInfoMessage(
                new MessageContext(this.textChannelID, null, this.guildID),
                {
                    title: i18n.translate(
                        this.guildID,
                        "misc.sendingBookmarkedSongs.title",
                    ),
                    description: i18n.translate(
                        this.guildID,
                        "misc.sendingBookmarkedSongs.description",
                        {
                            songs: i18n.translateN(
                                this.guildID,
                                "misc.plural.song",
                                bookmarkedSongCount,
                            ),
                            players: i18n.translateN(
                                this.guildID,
                                "misc.plural.player",
                                bookmarkedSongsPlayerCount,
                            ),
                        },
                    ),
                    thumbnailUrl: KmqImages.READING_BOOK,
                },
            );
            await sendBookmarkedSongs(this.guildID, this.bookmarkedSongs);

            // Store bookmarked songs
            await dbContext.kmq.transaction().execute(async (trx) => {
                const idLinkPairs: {
                    user_id: string;
                    vlink: string;
                    bookmarked_at: Date;
                }[] = [];

                for (const entry of Object.entries(this.bookmarkedSongs)) {
                    for (const song of entry[1]) {
                        idLinkPairs.push({
                            user_id: entry[0],
                            vlink: song[0],
                            bookmarked_at: song[1].bookmarkedAt,
                        });
                    }
                }

                await trx
                    .insertInto("bookmarked_songs")
                    .values(idLinkPairs)
                    .execute();
            });
        }

        // commit guild stats
        await dbContext.kmq
            .updateTable("guilds")
            .where("guild_id", "=", this.guildID)
            .set({
                games_played: sql`games_played + 1`,
            })
            .execute();
    }

    /**
     * Sets a timeout for guessing in timer mode
     * @param messageContext - An object containing relevant parts of Eris.Message
     */
    startGuessTimeout(messageContext: MessageContext): void {
        if (
            this.isListeningSession() ||
            !this.guildPreference.isGuessTimeoutSet() ||
            (this.isGameSession() && this.isClipMode())
        ) {
            return;
        }

        const time = this.guildPreference.gameOptions.guessTimeout;
        this.guessTimeoutFunc = setTimeout(async () => {
            if (this.finished || !this.round || this.round.finished) return;
            logger.info(
                `${getDebugLogHeader(
                    messageContext,
                )} | Song finished without being guessed, timer of: ${time} seconds.`,
            );

            if (this.isGameSession() && this.isClipMode()) {
                return;
            }

            await this.endRound(
                false,
                new MessageContext(this.textChannelID, null, this.guildID),
            );

            await this.startRound(messageContext);
        }, time * 1000);
    }

    /**
     * Stops the timer set in timer mode
     */
    stopGuessTimeout(): void {
        if (this.guessTimeoutFunc) {
            clearTimeout(this.guessTimeoutFunc);
        }
    }

    /**
     * Updates the Session's lastActive timestamp and it's value in the data store
     */
    async lastActiveNow(): Promise<void> {
        this.lastActive = Date.now();
        await dbContext.kmq
            .updateTable("guilds")
            .where("guild_id", "=", this.guildID)
            .set({ last_active: new Date() })
            .execute();
    }

    /**
     * Stores a song with a user so they can receive it later
     * @param userID - The user that wants to bookmark the song
     * @param bookmarkedSong - The song to store
     */
    addBookmarkedSong(userID: string, bookmarkedSong: BookmarkedSong): void {
        if (!userID) {
            return;
        }

        if (!this.bookmarkedSongs[userID]) {
            this.bookmarkedSongs[userID] = new Map();
        }

        this.bookmarkedSongs[userID]!.set(
            bookmarkedSong.song.youtubeLink,
            bookmarkedSong,
        );

        logger.info(
            `User ${userID} bookmarked song ${bookmarkedSong.song.youtubeLink}`,
        );
    }

    /** Sends a message notifying who the new owner is */
    async updateOwner(): Promise<void> {
        await sendInfoMessage(
            new MessageContext(this.textChannelID, null, this.guildID),
            {
                title: i18n.translate(
                    this.guildID,
                    "misc.gameOwnerChanged.title",
                ),
                description: i18n.translate(
                    this.guildID,
                    "misc.gameOwnerChanged.description",
                    {
                        newGameOwner: getMention(this.owner.id),
                        forcehintCommand: clickableSlashCommand("forcehint"),
                        forceskipCommand: clickableSlashCommand("forceskip"),
                    },
                ),
                thumbnailUrl: KmqImages.LISTENING,
            },
        );
    }

    getRemainingDuration(guildPreference: GuildPreference): number | null {
        const currGameLength = (Date.now() - this.startedAt) / 60000;
        return guildPreference.isDurationSet()
            ? guildPreference.gameOptions.duration - currGameLength
            : null;
    }

    async handleBookmarkInteraction(
        interaction: Eris.ComponentInteraction,
    ): Promise<void> {
        const youtubeLink = interaction.data.custom_id.split(":")[1]!;
        const song = await SongSelector.getSongByLink(youtubeLink);
        if (!song) {
            logger.error(
                `Failed to get song from bookmark. youtubeLink = ${youtubeLink}`,
            );
            return;
        }

        await tryCreateInteractionSuccessAcknowledgement(
            interaction,
            i18n.translate(this.guildID, "misc.interaction.bookmarked.title"),
            i18n.translate(
                this.guildID,
                "misc.interaction.bookmarked.description",
                {
                    songName: song.getLocalizedSongName(
                        State.getGuildLocale(this.guildID),
                    ),
                },
            ),
            true,
        );

        this.addBookmarkedSong(interaction.member?.id as string, {
            song,
            bookmarkedAt: new Date(),
        });
    }

    getRoundsPlayed(): number {
        return this.roundsPlayed;
    }

    /**
     * @param interaction - The interaction
     * @param _messageContext - Unused
     * @returns whether the interaction has been handled
     */
    async handleComponentInteraction(
        interaction: Eris.ComponentInteraction,
        _messageContext: MessageContext,
    ): Promise<boolean> {
        const round = this.round;
        if (!round) {
            return false;
        }

        if (interaction.data.custom_id.startsWith(BOOKMARK_BUTTON_PREFIX)) {
            await this.handleBookmarkInteraction(interaction);
            return true;
        }

        return false;
    }

    /**
     * Prepares a new Round
     * @param randomSong - The queried song
     * @returns the new Round
     */
    protected abstract prepareRound(randomSong: QueriedSong): Round;

    /**
     * Begin playing the Round's song in the VoiceChannel, listen on VoiceConnection events
     * @param messageContext - An object containing relevant parts of Eris.Message
     * @param round - The round associated with the played song
     * @param clipAction - For clip mode, whether to replay same clip or get a new one -- null for normal game
     * @returns whether the song streaming began successfully
     */
    protected async playSong(
        messageContext: MessageContext,
        round: Round,
        clipAction: ClipAction | null = null,
    ): Promise<boolean> {
        const isGodMode = EnvVariableManager.isGodMode();
        if (round.finished && clipAction !== ClipAction.END_ROUND) {
            return false;
        }

        if (!this.connection) {
            logger.error(
                `${getDebugLogHeader(
                    messageContext,
                )} | Unexpectedly null connection in playSong. clipAction = ${clipAction}`,
            );
            return false;
        }

        let songLocation = `${process.env.SONG_DOWNLOAD_DIR}/${round.song.youtubeLink}.ogg`;
        let seekLocation = 0;

        const seekType = this.isListeningSession()
            ? SeekType.BEGINNING
            : this.guildPreference.gameOptions.seekType;

        let songDuration = (
            await dbContext.kmq
                .selectFrom("cached_song_duration")
                .select(["duration"])
                .where("vlink", "=", round.song.youtubeLink)
                .executeTakeFirst()
        )?.duration;

        if (!songDuration) {
            if (!isGodMode) {
                logger.error(
                    `Song duration for ${round.song.youtubeLink} unexpectedly uncached. Defaulting to 60s`,
                );
            }

            songDuration = 60;
        }

        switch (seekType) {
            case SeekType.BEGINNING:
                seekLocation = 0;
                break;
            case SeekType.MIDDLE:
                // Play from [0.4, 0.6]
                seekLocation = songDuration * (0.4 + 0.2 * Math.random());
                break;
            case SeekType.RANDOM:
            default:
                // Play from [0, 0.6]
                seekLocation = songDuration * (0.6 * Math.random());
                break;
        }

        const isClipMode = this.isGameSession() && this.isClipMode();
        if (isClipMode) {
            const clipGameRound = round as ClipGameRound;
            if (clipAction && clipAction !== ClipAction.NEW_CLIP) {
                // Set to the previous play's seek location if replaying
                seekLocation = clipGameRound.seekLocation!;
            } else {
                // We enter here when the round is first started in clip mode
                // Ignore seek above and play from [0.2, 0.8]
                seekLocation = songDuration * (0.2 + 0.6 * Math.random());
            }

            clipGameRound.seekLocation = seekLocation;
        }

        if (isGodMode) {
            /*
                오빤 강남스타일
                강남스타일
                오빤 강남스타일
                강남스타일
                오빤 강남스타일

                Eh- Sexy Lady
                오빤 강남스타일
                Eh- Sexy Lady
                오오오오
            */
            songLocation = `${process.env.SONG_DOWNLOAD_DIR}/9bZkp7q19f0.ogg`;
            songDuration = 252;
            seekLocation = 70;
        }

        const stream = fs.createReadStream(songLocation);

        logger.info(
            `${getDebugLogHeader(
                messageContext,
            )} | Playing song in voice connection. seek = ${seekType}. song = ${this.getDebugSongDetails(round)}. guess mode = ${
                this.guildPreference.gameOptions.guessModeType
            }. clip mode = ${isClipMode}. clip action = ${clipAction}.`,
        );
        this.connection.removeAllListeners();
        this.connection.stopPlaying();

        try {
            let inputArgs = ["-ss", seekLocation.toString()];
            let encoderArgs: { [arg: string]: Array<string> } = {};
            const specialType = this.guildPreference.gameOptions.specialType;
            if (specialType) {
                const ffmpegArgs = specialFfmpegArgs[specialType](
                    seekLocation,
                    songDuration,
                );

                inputArgs = ffmpegArgs.inputArgs;
                encoderArgs = ffmpegArgs.encoderArgs;
            }

            if (isClipMode) {
                if (clipAction === ClipAction.END_ROUND) {
                    encoderArgs["-t"] = [
                        (
                            this.guildPreference.getSongStartDelay() +
                            this.clipDurationLength!
                        ).toString(),
                    ];
                } else {
                    encoderArgs["-t"] = [
                        (
                            this.clipDurationLength! +
                            CLIP_PADDING_BEGINNING_MS / 1000
                        ).toString(),
                    ];

                    if (encoderArgs["-af"]) {
                        encoderArgs["-af"].push(
                            `adelay=delays=${CLIP_PADDING_BEGINNING_MS}ms:all=1`,
                        );
                    } else {
                        encoderArgs["-af"] = [
                            `adelay=delays=${CLIP_PADDING_BEGINNING_MS}ms:all=1`,
                        ];
                    }
                }
            }

            // Only set songStartedAt for clip mode at the start of the round
            if (!isClipMode || round.songStartedAt === null) {
                round.songStartedAt = Date.now();
            }

            this.connection.play(stream, {
                inputArgs,
                encoderArgs: Object.entries(encoderArgs).flatMap((x) => [
                    x[0],
                    x[1].join(","),
                ]),
                opusPassthrough: specialType === null && !isClipMode,
                voiceDataTimeout: isClipMode
                    ? CLIP_VC_END_TIMEOUT_MS
                    : undefined,
            });
        } catch (e) {
            logger.error(`Erroring playing on voice connection. err = ${e}`);
            await this.errorRestartRound();
            return false;
        }

        this.startGuessTimeout(messageContext);

        this.connection.once("end", async () => {
            // replace listener with no-op to catch any exceptions thrown after this event
            if (this.connection) {
                this.connection.removeAllListeners("end");
                this.connection.on("end", () => {});
                if (clipAction !== ClipAction.END_ROUND) {
                    logger.info(
                        `${getDebugLogHeader(
                            messageContext,
                        )} | Song finished without being guessed.`,
                    );
                }
            }

            if (clipAction === ClipAction.END_ROUND) {
                // The end round clip doesn't deal with round state, it just plays and ends
                return;
            }

            this.stopGuessTimeout();

            if (this.isGameSession() && this.isClipMode()) {
                const clipGameRound = round as ClipGameRound;
                if (!round.finished) {
                    if (
                        clipGameRound.getReplayCount() < CLIP_MAX_REPLAY_COUNT
                    ) {
                        clipGameRound.incrementReplays();
                        await this.playSong(
                            messageContext,
                            round,
                            this.clipPlayNewClip
                                ? ClipAction.NEW_CLIP
                                : ClipAction.REPLAY,
                        );
                        return;
                    } else {
                        // Give some time to guess the song after the last replay has happened
                        // In addition to the time to receive this "end" event defined by CLIP_VC_END_TIMEOUT_MS
                        await delay(CLIP_LAST_REPLAY_DELAY_MS);
                        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                        if (round.finished) {
                            // The round was ended by a guess while we were waiting, so don't try to end the round, as
                            // the next round will be started by the guess
                            return;
                        }
                    }
                }
            }

            await this.endRound(
                false,
                new MessageContext(this.textChannelID, null, this.guildID),
            );

            await this.startRound(messageContext);
        });

        this.connection.once("error", async (err) => {
            if (this.connection) {
                // replace listener with no-op to catch any exceptions thrown after this event
                this.connection.removeAllListeners("error");
                this.connection.on("error", () => {});
            }

            if (clipAction === ClipAction.END_ROUND) {
                // Don't restart the round if the end round clip failed to play
                return;
            }

            logger.error(
                `${getDebugLogHeader(
                    messageContext,
                )} | Unknown error with stream dispatcher. song = ${this.getDebugSongDetails(round)}. err = ${err}`,
            );
            await this.errorRestartRound();
        });

        return true;
    }

    protected getSongCount(): {
        count: number;
        countBeforeLimit: number;
        ineligibleDueToCommonAlias?: number;
    } {
        const selectedSongs = this.guildPreference.songSelector.getSongs();
        return {
            count: selectedSongs.songs.size,
            countBeforeLimit: selectedSongs.countBeforeLimit,
            ineligibleDueToCommonAlias:
                selectedSongs.ineligibleDueToCommonAlias,
        };
    }

    /**
     * Handles common reasons for why an interaction would not succeed in a session
     * @param interaction - The interaction
     * @param _messageContext - Unused
     * @returns whether to continue with handling the interaction
     */
    protected async handleInSessionInteractionFailures(
        interaction: Eris.ComponentInteraction,
        _messageContext: MessageContext,
    ): Promise<boolean> {
        const round = this.round;

        if (!round) {
            return false;
        }

        if (
            !getCurrentVoiceMembers(this.voiceChannelID)
                .map((x) => x.id)
                .includes(interaction.member!.id)
        ) {
            await tryInteractionAcknowledge(interaction);
            return false;
        }

        if (!round.isValidInteraction(interaction.data.custom_id)) {
            await tryCreateInteractionErrorAcknowledgement(
                interaction,
                null,
                i18n.translate(
                    this.guildID,
                    "misc.failure.interaction.optionFromPreviousRound",
                ),
            );
            return false;
        }

        return true;
    }

    /**
     * Generates a bookmark button
     * @param round - The round
     * @param locale - The locale
     * @returns the button
     */
    protected static generateBookmarkButton(
        round: Round,
        locale: LocaleType,
    ): Eris.InteractionButton {
        return {
            type: Eris.Constants.ComponentTypes.BUTTON,
            style: Eris.Constants.ButtonStyles.SECONDARY,
            label: i18n.translate(locale, "misc.bookmark"),
            custom_id: `${BOOKMARK_BUTTON_PREFIX}:${round.song.youtubeLink}`,
            emoji: {
                id: null,
                name: "🔖",
            },
        };
    }

    /**
     * Generates a skip button
     * @param round - The round
     * @param locale - The locale
     * @returns the button
     */
    protected static generateSkipButton(
        round: Round,
        locale: LocaleType,
    ): Eris.InteractionButton {
        return {
            type: Eris.Constants.ComponentTypes.BUTTON,
            style: Eris.Constants.ButtonStyles.SECONDARY,
            custom_id: `${SKIP_BUTTON_PREFIX}:${round.song.youtubeLink}`,
            label: i18n.translate(locale, "misc.skip"),
            emoji: {
                id: null,
                name: "⏩",
            },
        };
    }

    /**
     * Sends a message displaying song/game related information
     * @param messageContext - An object to pass along relevant parts of Eris.Message
     * @param fields - The embed fields
     * @param round - The round
     * @param description - The description
     * @param embedColor - The embed color
     * @param shouldReply - Whether it should be a reply
     * @param timeRemaining - The time remaining
     * @returns the message
     */
    // eslint-disable-next-line @typescript-eslint/member-ordering
    protected async sendRoundMessage(
        messageContext: MessageContext,
        fields: Eris.EmbedField[],
        round: Round,
        description: string,
        embedColor: number | undefined,
        shouldReply: boolean,
        timeRemaining: number | null,
    ): Promise<Eris.Message<Eris.TextableChannel> | null> {
        const fact =
            Math.random() <= 0.05
                ? await FactGenerator.getFact(messageContext.guildID)
                : null;

        if (fact) {
            fields.push({
                name: underline(
                    i18n.translate(messageContext.guildID, "fact.didYouKnow"),
                ),
                value: fact,
                inline: false,
            });
        }

        const locale = State.getGuildLocale(messageContext.guildID);
        const song = round.song.getLocalizedSongName(locale);

        const artist = truncatedString(
            round.song.getLocalizedArtistName(locale),
            50,
        );

        const songAndArtist = `"${song}" - ${artist}`;

        // prioritize original link (usually the music video)
        const youtubeLink = round.song.originalLink || round.song.youtubeLink;
        const embed: EmbedPayload = {
            color: embedColor,
            title: `${songAndArtist} (${round.song.publishDate.getFullYear()})`,
            url: `https://youtu.be/${youtubeLink}`,
            description,
            fields,
        };

        const views = `${friendlyFormattedNumber(
            round.song.views,
        )} ${i18n.translate(messageContext.guildID, "misc.views")}\n`;

        const aliases = this.getAliasFooter(
            this.guildPreference.gameOptions.guessModeType,
            locale,
            round,
        );

        const duration = this.getDurationFooter(
            locale,
            timeRemaining ?? null,
            [views, aliases].every((x) => x.length > 0),
        );

        let footerText = `${views}${aliases}${duration}`;
        const thumbnailUrl = `https://img.youtube.com/vi/${youtubeLink}/hqdefault.jpg`;
        const buttons: Array<Eris.InteractionButton> = [];

        // add bookmark button
        buttons.push(Session.generateBookmarkButton(round, locale));

        if (round instanceof GameRound) {
            if (round.warnTypoReceived) {
                footerText += `\n/${i18n.translate(
                    locale,
                    "command.answer.help.name",
                )} set typingtypos?`;
            }

            if (round.interactionMessage) {
                embed.thumbnailUrl = thumbnailUrl;
                embed.footerText = footerText;
                try {
                    await round.interactionMessage.edit({
                        embeds: [generateEmbed(messageContext, embed)],
                    });
                } catch (e) {
                    logger.warn(
                        `Error editing roundMessage interaction. gid = ${this.guildID}. e = ${e}}`,
                    );
                }

                return round.interactionMessage;
            }
        } else if (round instanceof ListeningRound) {
            buttons.push(Session.generateSkipButton(round, locale));
        }

        round.interactionComponents = [
            {
                type: Eris.Constants.ComponentTypes.ACTION_ROW,
                components: buttons,
            },
        ];
        embed.actionRows = round.interactionComponents;
        embed.thumbnailUrl = thumbnailUrl;
        embed.footerText = footerText;
        return sendInfoMessage(messageContext, embed, shouldReply);
    }

    /**
     * @param round - The round
     * @returns Debug string containing basic information about the Round
     */
    private getDebugSongDetails(round: Round): string {
        return `${round.song.songName}:${round.song.artistName}:${round.song.youtubeLink}`;
    }

    private getDurationFooter(
        locale: LocaleType,
        timeRemaining: number | null,
        nonEmptyFooter: boolean,
    ): string {
        if (!timeRemaining) {
            return "";
        }

        let durationText = "";
        if (nonEmptyFooter) {
            durationText += "\n";
        }

        durationText +=
            timeRemaining > 0
                ? `⏰ ${i18n.translateN(
                      locale,
                      "misc.plural.minuteRemaining",
                      Math.ceil(timeRemaining),
                  )}`
                : `⏰ ${i18n.translate(locale, "misc.timeFinished")}!`;

        return durationText;
    }

    /**
     * Attempt to restart game with different song
     */
    private async errorRestartRound(): Promise<void> {
        const messageContext = new MessageContext(
            this.textChannelID,
            null,
            this.guildID,
        );

        await this.endRound(true, messageContext);

        await sendErrorMessage(messageContext, {
            title: i18n.translate(
                this.guildID,
                "misc.failure.songPlaying.title",
            ),
            description: i18n.translate(
                this.guildID,
                "misc.failure.songPlaying.description",
            ),
        });
        this.roundsPlayed--;
        await this.startRound(messageContext);
    }

    private getAliasFooter(
        guessModeType: GuessModeType,
        locale: LocaleType,
        round: Round,
    ): string {
        let aliases: Array<string> = [];
        if (guessModeType === GuessModeType.ARTIST) {
            if (round.song.hangulArtistName) {
                if (locale === LocaleType.KO) {
                    aliases.push(round.song.artistName);
                } else {
                    aliases.push(round.song.hangulArtistName);
                }
            }

            aliases.push(...round.artistAliases);
        } else {
            if (round.song.hangulSongName) {
                if (locale === LocaleType.KO) {
                    aliases.push(round.song.songName);
                } else {
                    aliases.push(round.song.hangulSongName);
                }
            }

            aliases.push(...round.songAliases);
        }

        if (aliases.length === 0) {
            return "";
        }

        // dont include the original song name as an alias
        aliases = aliases.filter(
            (alias) => alias !== round.song.getLocalizedSongName(locale),
        );

        if (aliases.length === 0) {
            return "";
        }

        const aliasesText = i18n.translate(locale, "misc.inGame.aliases");

        return `${aliasesText}: ${aliases.join(", ")}`;
    }
}
