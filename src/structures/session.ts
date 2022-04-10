import Eris from "eris";
import fs from "fs";
import { IPCLogger } from "../logger";
import {
    getDebugLogHeader,
    getGuildLocale,
    sendBookmarkedSongs,
    sendErrorMessage,
    sendInfoMessage,
    tryCreateInteractionErrorAcknowledgement,
    tryCreateInteractionSuccessAcknowledgement,
} from "../helpers/discord_utils";
import dbContext from "../database_context";
import { QueriedSong } from "../types";
import { GuessResult } from "./game_session";
import GuildPreference from "./guild_preference";
import KmqMember from "./kmq_member";
import MessageContext from "./message_context";
import Round from "./round";
import SongSelector from "./song_selector";
import { deleteGameSession } from "../helpers/management_utils";
import {
    ensureVoiceConnection,
    getGuildPreference,
    getLocalizedSongName,
} from "../helpers/game_utils";
import { state } from "../kmq_worker";
import { KmqImages } from "../constants";
import { bold, friendlyFormattedNumber } from "../helpers/utils";
import { SeekType } from "../commands/game_options/seek";
import { specialFfmpegArgs } from "../commands/game_options/special";

export const SONG_START_DELAY = 3000;
const BOOKMARK_MESSAGE_SIZE = 10;

const logger = new IPCLogger("session");

export default abstract class Session {
    /** The ID of text channel in which the GameSession was started in, and will be active in */
    public readonly textChannelID: string;

    /** The Discord Guild ID */
    public readonly guildID: string;

    /** The time the GameSession was started in epoch milliseconds */
    public readonly startedAt: number;

    /** The ID of the voice channel in which the GameSession was started in, and will be active in */
    public voiceChannelID: string;

    /** Initially the user who started the GameSession, transferred to current VC member */
    public owner: KmqMember;

    /** The current active Eris.VoiceConnection */
    public connection: Eris.VoiceConnection;

    /** The last time of activity in epoch milliseconds, used to track inactive sessions  */
    public lastActive: number;

    /** The current Round */
    public round: Round;

    /** Whether the GameSession has ended or not */
    public finished: boolean;

    /** Whether the GameSession is active yet */
    public sessionInitialized: boolean;

    protected songSelector: SongSelector;

    /** The number of Rounds played */
    protected roundsPlayed: number;

    /** Array of previous songs by messageID for bookmarking songs */
    private songMessageIDs: { messageID: string; song: QueriedSong }[];

    /** Mapping of user ID to bookmarked songs, uses Map since Set doesn't remove QueriedSong duplicates */
    private bookmarkedSongs: { [userID: string]: Map<string, QueriedSong> };

    /** Timer function used to for ,timer command */
    private guessTimeoutFunc: NodeJS.Timer;

    constructor(
        textChannelID: string,
        voiceChannelID: string,
        guildID: string,
        gameSessionCreator: KmqMember
    ) {
        this.textChannelID = textChannelID;
        this.voiceChannelID = voiceChannelID;
        this.guildID = guildID;
        this.owner = gameSessionCreator;
        this.lastActive = Date.now();
        this.startedAt = Date.now();
        this.finished = false;
        this.roundsPlayed = 0;
        this.songMessageIDs = [];
        this.bookmarkedSongs = {};
        this.songSelector = new SongSelector();
    }

    /**
     * Starting a new Round
     * @param guildPreference - The guild's GuildPreference
     * @param messageContext - An object containing relevant parts of Eris.Message
     */
    async startRound(
        guildPreference: GuildPreference,
        messageContext: MessageContext
    ): Promise<void> {
        this.sessionInitialized = true;

        if (this.songSelector.getSongs() === null) {
            try {
                await this.reloadSongs(guildPreference);
            } catch (err) {
                await sendErrorMessage(messageContext, {
                    title: state.localizer.translate(
                        this.guildID,
                        "misc.failure.errorSelectingSong.title"
                    ),
                    description: state.localizer.translate(
                        this.guildID,
                        "misc.failure.errorSelectingSong.description"
                    ),
                });

                logger.error(
                    `${getDebugLogHeader(
                        messageContext
                    )} | Error querying song: ${err.toString()}. guildPreference = ${JSON.stringify(
                        guildPreference
                    )}`
                );
                await this.endSession();
                return;
            }
        }

        if (this.songSelector.checkUniqueSongQueue()) {
            const totalSongCount = this.songSelector.getCurrentSongCount();
            logger.info(
                `${getDebugLogHeader(
                    messageContext
                )} | Resetting uniqueSongsPlayed (all ${totalSongCount} unique songs played)`
            );

            await sendInfoMessage(messageContext, {
                title: state.localizer.translate(
                    this.guildID,
                    "misc.uniqueSongsReset.title"
                ),
                description: state.localizer.translate(
                    this.guildID,
                    "misc.uniqueSongsReset.description",
                    { totalSongCount: friendlyFormattedNumber(totalSongCount) }
                ),
                thumbnailUrl: KmqImages.LISTENING,
            });
        }

        this.songSelector.checkAlternatingGender(guildPreference);
        const randomSong = await this.songSelector.queryRandomSong();

        if (randomSong === null) {
            sendErrorMessage(messageContext, {
                title: state.localizer.translate(
                    this.guildID,
                    "misc.failure.songQuery.title"
                ),
                description: state.localizer.translate(
                    this.guildID,
                    "misc.failure.songQuery.description"
                ),
            });
            await this.endSession();
            return;
        }

        // create a new round with randomly chosen song
        this.round = this.prepareRound(randomSong);

        const voiceChannel = state.client.getChannel(
            this.voiceChannelID
        ) as Eris.VoiceChannel;

        if (!voiceChannel || voiceChannel.voiceMembers.size === 0) {
            await this.endSession();
            return;
        }

        // join voice channel and start round
        try {
            await ensureVoiceConnection(this);
        } catch (err) {
            await this.endSession();
            logger.error(
                `${getDebugLogHeader(
                    messageContext
                )} | Error obtaining voice connection. err = ${err.toString()}`
            );

            await sendErrorMessage(messageContext, {
                title: state.localizer.translate(
                    this.guildID,
                    "misc.failure.vcJoin.title"
                ),
                description: state.localizer.translate(
                    this.guildID,
                    "misc.failure.vcJoin.description"
                ),
            });
            return;
        }

        this.playSong(guildPreference, messageContext);
    }

    /**
     * Ends an active Round
     * @param guildPreference - The GuildPreference
     * @param _messageContext - unused
     * @param _guessResult - unused
     */
    async endRound(
        guildPreference: GuildPreference,
        _messageContext?: MessageContext,
        _guessResult?: GuessResult
    ): Promise<void> {
        if (this.round === null) {
            return;
        }

        const round = this.round;
        this.round = null;

        if (Object.keys(this.songMessageIDs).length === BOOKMARK_MESSAGE_SIZE) {
            this.songMessageIDs.shift();
        }

        if (round.endRoundMessageID) {
            this.songMessageIDs.push({
                messageID: round.endRoundMessageID,
                song: {
                    songName: round.song.songName,
                    originalSongName: round.song.originalSongName,
                    hangulSongName: round.song.hangulSongName,
                    originalHangulSongName: round.song.originalHangulSongName,
                    artistName: round.song.artistName,
                    hangulArtistName: round.song.hangulArtistName,
                    youtubeLink: round.song.youtubeLink,
                    publishDate: round.song.publishDate,
                    views: round.song.views,
                },
            });
        }

        // cleanup
        this.stopGuessTimeout();

        if (this.finished) return;
        this.roundsPlayed++;
        // check if duration has been reached
        const remainingDuration = this.getRemainingDuration(guildPreference);
        if (remainingDuration && remainingDuration < 0) {
            logger.info(`gid: ${this.guildID} | Game session duration reached`);
            this.endSession();
        }
    }

    /**
     * Ends the current GameSession
     */
    async endSession(): Promise<void> {
        deleteGameSession(this.guildID);
        await this.endRound(
            await getGuildPreference(this.guildID),
            new MessageContext(this.textChannelID, null, this.guildID),
            { correct: false }
        );

        const voiceConnection = state.client.voiceConnections.get(this.guildID);

        // leave voice channel
        if (voiceConnection && voiceConnection.channelID) {
            voiceConnection.stopPlaying();
            const voiceChannel = state.client.getChannel(
                voiceConnection.channelID
            ) as Eris.VoiceChannel;

            if (voiceChannel) {
                voiceChannel.leave();
            }
        }

        // DM bookmarked songs
        const bookmarkedSongsPlayerCount = Object.keys(
            this.bookmarkedSongs
        ).length;

        if (bookmarkedSongsPlayerCount > 0) {
            const bookmarkedSongCount = Object.values(
                this.bookmarkedSongs
            ).reduce((total, x) => total + x.size, 0);

            await sendInfoMessage(new MessageContext(this.textChannelID), {
                title: state.localizer.translate(
                    this.guildID,
                    "misc.sendingBookmarkedSongs.title"
                ),
                description: state.localizer.translate(
                    this.guildID,
                    "misc.sendingBookmarkedSongs.description",
                    {
                        songs: state.localizer.translateN(
                            this.guildID,
                            "misc.plural.song",
                            bookmarkedSongCount
                        ),
                        players: state.localizer.translateN(
                            this.guildID,
                            "misc.plural.player",
                            bookmarkedSongsPlayerCount
                        ),
                    }
                ),
                thumbnailUrl: KmqImages.READING_BOOK,
            });
            await sendBookmarkedSongs(this.guildID, this.bookmarkedSongs);

            // Store bookmarked songs
            await dbContext.kmq.transaction(async (trx) => {
                const idLinkPairs: { user_id: string; vlink: string }[] = [];
                for (const entry of Object.entries(this.bookmarkedSongs)) {
                    for (const song of entry[1]) {
                        idLinkPairs.push({ user_id: entry[0], vlink: song[0] });
                    }
                }

                await dbContext
                    .kmq("bookmarked_songs")
                    .insert(idLinkPairs)
                    .onConflict(["user_id", "vlink"])
                    .ignore()
                    .transacting(trx);
            });
        }

        // commit guild stats
        await dbContext
            .kmq("guilds")
            .where("guild_id", this.guildID)
            .increment("games_played", 1);
    }

    /**
     * Sets a timeout for guessing in timer mode
     * @param messageContext - An object containing relevant parts of Eris.Message
     * @param guildPreference - The GuildPreference
     */
    startGuessTimeout(
        messageContext: MessageContext,
        guildPreference: GuildPreference
    ): Promise<void> {
        if (!guildPreference.isGuessTimeoutSet()) return;

        const time = guildPreference.gameOptions.guessTimeout;
        this.guessTimeoutFunc = setTimeout(async () => {
            if (this.finished || !this.round || this.round.finished) return;
            logger.info(
                `${getDebugLogHeader(
                    messageContext
                )} | Song finished without being guessed, timer of: ${time} seconds.`
            );

            await this.endRound(
                guildPreference,
                new MessageContext(this.textChannelID, null, this.guildID),
                { correct: false }
            );

            this.startRound(
                await getGuildPreference(this.guildID),
                messageContext
            );
        }, time * 1000);
    }

    /**
     * Stops the timer set in timer mode
     */
    stopGuessTimeout(): void {
        clearTimeout(this.guessTimeoutFunc);
    }

    /**
     * Updates the GameSession's lastActive timestamp and it's value in the data store
     */
    async lastActiveNow(): Promise<void> {
        this.lastActive = Date.now();
        await dbContext
            .kmq("guilds")
            .where({ guild_id: this.guildID })
            .update({ last_active: new Date() });
    }

    async reloadSongs(guildPreference: GuildPreference): Promise<void> {
        await this.songSelector.reloadSongs(
            guildPreference,
            state.gameSessions[this.guildID]?.isPremiumGame() ?? false
        );
    }

    /**
     * Finds the song associated with the endRoundMessage via messageID, if it exists
     * @param messageID - The Discord message ID used to locate the song
     * @returns the queried song, or null if it doesn't exist
     */
    getSongFromMessageID(messageID: string): QueriedSong {
        if (!this.songMessageIDs.map((x) => x.messageID).includes(messageID)) {
            return null;
        }

        return this.songMessageIDs.find((x) => x.messageID === messageID).song;
    }

    /**
     * Stores a song with a user so they can receive it later
     * @param userID - The user that wants to bookmark the song
     * @param song - The song to store
     */
    addBookmarkedSong(userID: string, song: QueriedSong): void {
        if (!userID || !song) {
            return;
        }

        if (!this.bookmarkedSongs[userID]) {
            this.bookmarkedSongs[userID] = new Map();
        }

        this.bookmarkedSongs[userID].set(song.youtubeLink, song);
    }

    /** Updates owner to the first player to join the game that didn't leave VC */
    abstract updateOwner(): Promise<void>;

    getRemainingDuration(guildPreference: GuildPreference): number {
        const currGameLength = (Date.now() - this.startedAt) / 60000;
        return guildPreference.isDurationSet()
            ? guildPreference.gameOptions.duration - currGameLength
            : null;
    }

    async handleBookmarkInteraction(
        interaction: Eris.CommandInteraction
    ): Promise<void> {
        const song = this.getSongFromMessageID(interaction.data.target_id);
        if (!song) {
            tryCreateInteractionErrorAcknowledgement(
                interaction,
                state.localizer.translate(
                    this.guildID,
                    "misc.failure.interaction.invalidBookmark",
                    { BOOKMARK_MESSAGE_SIZE: String(BOOKMARK_MESSAGE_SIZE) }
                )
            );
            return;
        }

        tryCreateInteractionSuccessAcknowledgement(
            interaction,
            state.localizer.translate(
                this.guildID,
                "misc.interaction.bookmarked.title"
            ),
            state.localizer.translate(
                this.guildID,
                "misc.interaction.bookmarked.description",
                {
                    songName: bold(
                        getLocalizedSongName(song, getGuildLocale(this.guildID))
                    ),
                }
            )
        );
        this.addBookmarkedSong(interaction.member?.id, song);
    }

    getRoundsPlayed(): number {
        return this.roundsPlayed;
    }

    /**
     * Prepares a new Round
     * @param randomSong - The queried song
     * @returns the new Round
     */
    protected abstract prepareRound(randomSong: QueriedSong): Round;

    /**
     * Begin playing the Round's song in the VoiceChannel, listen on VoiceConnection events
     * @param guildPreference - The guild's GuildPreference
     * @param messageContext - An object containing relevant parts of Eris.Message
     */
    protected async playSong(
        guildPreference: GuildPreference,
        messageContext: MessageContext
    ): Promise<void> {
        const { round } = this;
        if (round === null) {
            return;
        }

        const songLocation = `${process.env.SONG_DOWNLOAD_DIR}/${round.song.youtubeLink}.ogg`;

        let seekLocation: number;
        const seekType = guildPreference.gameOptions.seekType;
        if (seekType === SeekType.BEGINNING) {
            seekLocation = 0;
        } else {
            const songDuration = (
                await dbContext
                    .kmq("cached_song_duration")
                    .select(["duration"])
                    .where("vlink", "=", round.song.youtubeLink)
                    .first()
            ).duration;

            if (seekType === SeekType.RANDOM) {
                seekLocation = songDuration * (0.6 * Math.random());
            } else if (seekType === SeekType.MIDDLE) {
                seekLocation = songDuration * (0.4 + 0.2 * Math.random());
            }
        }

        const stream = fs.createReadStream(songLocation);

        logger.info(
            `${getDebugLogHeader(
                messageContext
            )} | Playing song in voice connection. seek = ${seekType}. song = ${this.getDebugSongDetails()}. guess mode = ${
                guildPreference.gameOptions.guessModeType
            }`
        );
        this.connection.removeAllListeners();
        this.connection.stopPlaying();
        try {
            let inputArgs = ["-ss", seekLocation.toString()];
            let encoderArgs = [];
            const specialType = guildPreference.gameOptions.specialType;
            if (specialType) {
                const ffmpegArgs = specialFfmpegArgs[specialType](seekLocation);
                inputArgs = ffmpegArgs.inputArgs;
                encoderArgs = ffmpegArgs.encoderArgs;
            }

            this.connection.play(stream, {
                inputArgs,
                encoderArgs,
                opusPassthrough: specialType === null,
            });
        } catch (e) {
            logger.error(`Erroring playing on voice connection. err = ${e}`);
            await this.errorRestartRound(guildPreference);
            return;
        }

        this.startGuessTimeout(messageContext, guildPreference);

        // song finished without being guessed
        this.connection.once("end", async () => {
            // replace listener with no-op to catch any exceptions thrown after this event
            this.connection.removeAllListeners("end");
            this.connection.on("end", () => {});
            logger.info(
                `${getDebugLogHeader(
                    messageContext
                )} | Song finished without being guessed.`
            );
            this.stopGuessTimeout();

            await this.endRound(
                guildPreference,
                new MessageContext(this.textChannelID, null, this.guildID),
                { correct: false }
            );

            this.startRound(
                await getGuildPreference(this.guildID),
                messageContext
            );
        });

        this.connection.once("error", async (err) => {
            // replace listener with no-op to catch any exceptions thrown after this event
            this.connection.removeAllListeners("error");
            this.connection.on("error", () => {});
            logger.error(
                `${getDebugLogHeader(
                    messageContext
                )} | Unknown error with stream dispatcher. song = ${this.getDebugSongDetails()}. err = ${err}`
            );
            this.errorRestartRound(guildPreference);
        });
    }

    protected getSongCount(): { count: number; countBeforeLimit: number } {
        const selectedSongs = this.songSelector.getSongs();
        return {
            count: selectedSongs.songs.size,
            countBeforeLimit: selectedSongs.countBeforeLimit,
        };
    }

    /**
     * @returns Debug string containing basic information about the Round
     */
    private getDebugSongDetails(): string {
        if (!this.round) return "No active game round";
        return `${this.round.song.songName}:${this.round.song.artistName}:${this.round.song.youtubeLink}`;
    }

    /**
     * Attempt to restart game with different song
     * @param guildPreference - The GuildPreference
     */
    private async errorRestartRound(
        guildPreference: GuildPreference
    ): Promise<void> {
        const messageContext = new MessageContext(this.textChannelID);
        await this.endRound(guildPreference, null, {
            correct: false,
            error: true,
        });

        await sendErrorMessage(messageContext, {
            title: state.localizer.translate(
                this.guildID,
                "misc.failure.songPlaying.title"
            ),
            description: state.localizer.translate(
                this.guildID,
                "misc.failure.songPlaying.description"
            ),
        });
        this.roundsPlayed--;
        this.startRound(guildPreference, messageContext);
    }
}
