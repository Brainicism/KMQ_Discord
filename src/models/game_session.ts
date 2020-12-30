import Eris from "eris";
import fs from "fs";
import { SeekType } from "../commands/game_options/seek";
import { ShuffleType } from "../commands/game_options/shuffle";
import dbContext from "../database_context";
import { isDebugMode, skipSongPlay } from "../helpers/debug_utils";
import {
    getDebugContext, getSqlDateString, getUserTag, getVoiceChannel, sendErrorMessage, sendEndOfRoundMessage,
} from "../helpers/discord_utils";
import { ensureVoiceConnection, getGuildPreference, selectRandomSong, getSongCount, endSession } from "../helpers/game_utils";
import { delay, getAudioDurationInSeconds } from "../helpers/utils";
import state from "../kmq";
import _logger from "../logger";
import { QueriedSong } from "../types";
import GameRound from "./game_round";
import GuildPreference from "./guild_preference";
import Scoreboard from "./scoreboard";
import EliminationScoreboard from "./elimination_scoreboard";
import { deleteGameSession } from "../helpers/management_utils";
import { GameType } from "../commands/game_commands/play";
import { ModeType } from "../commands/game_options/mode";

const logger = _logger("game_session");
const LAST_PLAYED_SONG_QUEUE_SIZE = 10;

export default class GameSession {
    /** The GameType that the GameSession started in */
    public readonly gameType: GameType;

    /** The user who initiated the GameSession */
    public readonly owner: Eris.User;

    /** The Scoreboard object keeping track of players and scoring */
    public readonly scoreboard: Scoreboard;

    /** The Eris.TextChannel in which the GameSession was started in, and will be active in */
    public readonly textChannel: Eris.TextChannel;

    /** The Eris.VoiceChannel in which the GameSession was started in, and will be active in */
    public readonly voiceChannel: Eris.VoiceChannel;

    /** Whether the GameSession is active yet */
    public sessionInitialized: boolean;

    /** The current active Eris.VoiceConnection */
    public connection: Eris.VoiceConnection;

    /** Whether the GameSession has ended or not */
    public finished: boolean;

    /** The last time of activity in epoch milliseconds, used to track inactive sessions  */
    public lastActive: number;

    /** The current GameRound */
    public gameRound: GameRound;

    /** List of active participants in the GameSession */
    public participants: Set<string>;

    /** The time the GameSession was started in epoch milliseconds */
    private readonly startedAt: number;

    /** The number of GameRounds played */
    private roundsPlayed: number;

    /** List of guess times per GameRound */
    private guessTimes: Array<number>;

    /** Timer function used to for !timer command */
    private guessTimeoutFunc: NodeJS.Timer;

    /** List of recently played songs used to prevent frequent repeats */
    private lastPlayedSongsQueue: Array<string>;

    constructor(textChannel: Eris.TextChannel, voiceChannel: Eris.VoiceChannel, gameSessionCreator: Eris.User, gameType: GameType, eliminationLives?: number) {
        this.gameType = gameType;
        this.scoreboard = this.gameType === GameType.ELIMINATION ? new EliminationScoreboard(eliminationLives, textChannel.guild.id) : new Scoreboard(textChannel.guild.id);
        this.lastActive = Date.now();
        this.sessionInitialized = false;
        this.startedAt = Date.now();
        this.participants = new Set();
        this.roundsPlayed = 0;
        this.guessTimes = [];
        this.connection = null;
        this.finished = false;
        this.voiceChannel = voiceChannel;
        this.textChannel = textChannel;
        this.gameRound = null;
        this.owner = gameSessionCreator;
        this.lastPlayedSongsQueue = [];
    }

    /**
     * Ends an active GameRound
     * @param guessed - Whether the round ended via a correct guess, or other (timeout, error, etc)
     */
    async endRound(guessed: boolean) {
        if (guessed) {
            this.guessTimes.push(Date.now() - this.gameRound.startedAt);
        }

        this.gameRound = null;
        if (this.connection) {
            this.connection.removeAllListeners();
        }
        this.stopGuessTimeout();
        if (this.finished) return;

        if (await this.scoreboard.gameFinished()) {
            endSession({ channel: this.textChannel, authorId: this.owner.id }, this);
        }
    }

    /**
     * Ends the current GameSession
     */
    endSession = async (): Promise<void> => {
        const guildId = this.textChannel.guild.id;
        this.finished = true;
        await this.endRound(false);
        const voiceConnection = state.client.voiceConnections.get(guildId);

        // leave voice channel
        if (voiceConnection && voiceConnection.channelID) {
            voiceConnection.stopPlaying();
            const voiceChannel = state.client.getChannel(voiceConnection.channelID) as Eris.VoiceChannel;
            if (voiceChannel) {
                voiceChannel.leave();
            }
        }

        // commit player stats
        for (const participant of this.participants) {
            await this.ensurePlayerStat(participant);
            await this.incrementPlayerGamesPlayed(participant);
            const playerScore = this.scoreboard.getPlayerScore(participant);
            if (playerScore > 0) {
                await this.incrementPlayerSongsGuessed(participant, playerScore);
            }
        }

        // commit guild stats
        await dbContext.kmq("guild_preferences")
            .where("guild_id", guildId)
            .increment("games_played", 1);

        // commit guild's game session
        const sessionLength = (Date.now() - this.startedAt) / (1000 * 60);
        const averageGuessTime = this.guessTimes.length > 0 ? this.guessTimes.reduce((a, b) => a + b, 0) / (this.guessTimes.length * 1000) : -1;

        await dbContext.kmq("game_sessions")
            .insert({
                start_date: getSqlDateString(this.startedAt),
                guild_id: this.textChannel.guild.id,
                num_participants: this.participants.size,
                avg_guess_time: averageGuessTime,
                session_length: sessionLength,
                rounds_played: this.roundsPlayed,
            });

        logger.info(`gid: ${guildId} | Game session ended. rounds_played = ${this.roundsPlayed}. session_length = ${sessionLength}. gameType = ${this.gameType}`);
        deleteGameSession(guildId);
    };

    /**
     * Updates the GameSession's lastActive timestamp and it's value in the data store
     */
    async lastActiveNow(): Promise<void> {
        this.lastActive = Date.now();
        await dbContext.kmq("guild_preferences")
            .where({ guild_id: this.textChannel.guild.id })
            .update({ last_active: new Date() });
    }

    /**
     * Process a message to see if it is a valid and correct guess
     * @param message - The message to check
     */
    async guessSong(message: Eris.Message<Eris.GuildTextableChannel>) {
        const guildPreference = await getGuildPreference(message.guildID);
        const userVoiceChannel = getVoiceChannel(message);
        if (!this.gameRound) return;

        // if user isn't in the same voice channel
        if (!userVoiceChannel || (userVoiceChannel.id !== this.voiceChannel.id)) {
            return;
        }

        // if message isn't in the active game session's text channel
        if (message.channel.id !== this.textChannel.id) {
            return;
        }

        const pointsEarned = this.checkGuess(message, guildPreference.getModeType());
        if (pointsEarned > 0) {
            logger.info(`${getDebugContext(message)} | Song correctly guessed. song = ${this.gameRound.songName}`);

            // update game session's lastActive
            const gameSession = state.gameSessions[message.guildID];
            gameSession.lastActiveNow();

            // elimination mode, check if current user is allowed to guess
            if (this.gameType === GameType.ELIMINATION) {
                const eliminationScoreboard = this.scoreboard as EliminationScoreboard;
                if (!this.participants.has(message.author.id) || eliminationScoreboard.isPlayerEliminated(message.author.id)) {
                    return;
                }
            }

            // update scoreboard
            const userTag = getUserTag(message.author);
            this.scoreboard.updateScoreboard(userTag, message.author.id, message.author.avatarURL, pointsEarned);

            // misc. game round cleanup
            this.stopGuessTimeout();
            await sendEndOfRoundMessage(message, this.scoreboard, this.gameRound, false, userTag);
            await this.endRound(true);

            // increment guild's song guess count
            await dbContext.kmq("guild_preferences")
                .where("guild_id", message.guildID)
                .increment("songs_guessed", 1);

            this.startRound(guildPreference, message);
        }
    }

    /**
     * Starting a new GameRound
     * @param guildPreference - The guild's GuildPreference
     * @param message - The Message that initiated the round
     */
    async startRound(guildPreference: GuildPreference, message: Eris.Message<Eris.GuildTextableChannel>) {
        this.sessionInitialized = true;
        await delay(3000);
        if (this.finished || this.gameRound) {
            return;
        }
        const totalSongs = await getSongCount(guildPreference);

        // manage recently played song queue
        if (guildPreference.getShuffleType() === ShuffleType.UNIQUE && Math.min(guildPreference.getLimit(), totalSongs) === this.lastPlayedSongsQueue.length) {
            logger.info(`${getDebugContext(message)} | Resetting lastPlayedSongsQueue (all ${guildPreference.getLimit()} unique songs played)`);
            this.resetLastPlayedSongsQueue();
        } else if (guildPreference.getShuffleType() === ShuffleType.RANDOM && this.lastPlayedSongsQueue.length === LAST_PLAYED_SONG_QUEUE_SIZE) {
            this.lastPlayedSongsQueue.shift();
        }

        // query for random song
        let randomSong: QueriedSong;
        try {
            randomSong = await selectRandomSong(guildPreference, this.lastPlayedSongsQueue);
            if (randomSong === null) {
                sendErrorMessage(message, "Song Query Error", "Failed to find songs matching this criteria. Try to broaden your search.");
                this.endSession();
                return;
            }
        } catch (err) {
            await sendErrorMessage(message, "Error selecting song", "Please try starting the round again. If the issue persists, report it in our support server.");
            logger.error(`${getDebugContext(message)} | Error querying song: ${err.toString()}. guildPreference = ${JSON.stringify(guildPreference)}`);
            this.endSession();
            return;
        }

        if ((guildPreference.getLimit() > LAST_PLAYED_SONG_QUEUE_SIZE && totalSongs > LAST_PLAYED_SONG_QUEUE_SIZE)
            || guildPreference.getShuffleType() === ShuffleType.UNIQUE) {
            this.lastPlayedSongsQueue.push(randomSong.youtubeLink);
        }

        // create a new round with randomly chosen song
        this.prepareRound(randomSong.name, randomSong.artist, randomSong.youtubeLink);

        // join voice channel and start round
        try {
            await ensureVoiceConnection(this);
        } catch (err) {
            await this.endSession();
            logger.error(`${getDebugContext(message)} | Error obtaining voice connection. err = ${err.toString()}`);
            await sendErrorMessage(message, "Missing voice permissions", "The bot is unable to join the voice channel you are in.");
            return;
        }
        this.playSong(guildPreference, message);
    }

    /**
     * Sets a timeout for guessing in timer mode
     * @param message - The message that initiated the round
     */
    async startGuessTimeout(message: Eris.Message<Eris.GuildTextableChannel>) {
        const guildPreference = await getGuildPreference(message.guildID);
        if (!guildPreference.isGuessTimeoutSet()) return;

        const time = guildPreference.getGuessTimeout();
        this.guessTimeoutFunc = setTimeout(async () => {
            if (this.finished) return;
            logger.info(`${getDebugContext(message)} | Song finished without being guessed, timer of: ${time} seconds.`);
            if (this.gameType === GameType.ELIMINATION) {
                const eliminationScoreboard = this.scoreboard as EliminationScoreboard;
                eliminationScoreboard.decrementAllLives();
            }
            await sendEndOfRoundMessage(message, this.scoreboard, this.gameRound, true);
            await this.endRound(false);
            this.startRound(guildPreference, message);
        }, time * 1000);
    }

    /**
     * Stops the timer set in timer mode
     */
    stopGuessTimeout() {
        clearTimeout(this.guessTimeoutFunc);
    }

    /**
     * Resets the recently played song queue
     */
    resetLastPlayedSongsQueue() {
        this.lastPlayedSongsQueue = [];
    }

    /**
     * Adds a participant for elimination mode
     * @param user - The user to add
     */
    addEliminationParticipant(user: Eris.User) {
        this.participants.add(user.id);
        const eliminationScoreboard = this.scoreboard as EliminationScoreboard;
        eliminationScoreboard.addPlayer(user.id, getUserTag(user), user.avatarURL);
    }

    /**
     * Begin playing the GameRound's song in the VoiceChannel, listen on VoiceConnection events
     * @param guildPreference - The guild's GuildPreference
     * @param message - The Message that initiated the round
     */
    private async playSong(guildPreference: GuildPreference, message: Eris.Message<Eris.GuildTextableChannel>) {
        const { gameRound } = this;
        if (isDebugMode() && skipSongPlay()) {
            logger.debug(`${getDebugContext(message)} | Not playing song in voice connection. song = ${this.getDebugSongDetails()}`);
            return;
        }
        const songLocation = `${process.env.SONG_DOWNLOAD_DIR}/${gameRound.videoID}.ogg`;

        let seekLocation: number;
        if (guildPreference.getSeekType() === SeekType.RANDOM) {
            const songDuration = await getAudioDurationInSeconds(songLocation);
            seekLocation = songDuration * (0.6 * Math.random());
        } else {
            seekLocation = 0;
        }

        const stream = fs.createReadStream(songLocation);

        logger.info(`${getDebugContext(message)} | Playing song in voice connection. seek = ${guildPreference.getSeekType()}. song = ${this.getDebugSongDetails()}. mode = ${guildPreference.getModeType()}`);
        this.connection.stopPlaying();
        this.connection.play(stream, {
            inputArgs: ["-ss", seekLocation.toString()],
        });

        this.startGuessTimeout(message);

        // song finished without being guessed
        this.connection.once("end", async () => {
            logger.info(`${getDebugContext(message)} | Song finished without being guessed.`);
            this.stopGuessTimeout();
            await sendEndOfRoundMessage(message, this.scoreboard, this.gameRound, true);
            await this.endRound(false);
            this.startRound(guildPreference, message);
        });

        // admin manually 'disconnected' bot from voice channel or misc error
        this.connection.once("error", async (err) => {
            if (!this.connection.channelID) {
                logger.info(`gid: ${this.textChannel.guild.id} | Bot was kicked from voice channel`);
                this.stopGuessTimeout();
                endSession(message, this);
                return;
            }

            logger.error(`${getDebugContext(message)} | Unknown error with stream dispatcher. song = ${this.getDebugSongDetails()}. err = ${err}`);
            // Attempt to restart game with different song
            await sendErrorMessage(message, "Error playing song", "Starting new round in 3 seconds...");
            await this.endRound(false);
            this.startRound(guildPreference, message);
        });
    }

    /**
     * Prepares a new GameRound
     * @param song - The name of the song
     * @param artist - The name of the artist
     * @param videoID - The song's corresponding YouTube ID
     */
    private prepareRound(song: string, artist: string, videoID: string) {
        this.gameRound = new GameRound(song, artist, videoID);
        this.roundsPlayed++;
    }

    /**
     *
     * @param message - The message to check for correct guess
     * @param modeType - The guessing mode type to evaluate the guess against
     * @returns The number of points achieved for the guess
     */
    private checkGuess(message: Eris.Message, modeType: ModeType): number {
        if (!this.gameRound) return 0;
        if (this.gameType === GameType.CLASSIC) {
            this.participants.add(message.author.id);
        }
        return this.gameRound.checkGuess(message, modeType);
    }

    /**
     * Creates/updates a user's activity in the data store
     * @param userId - The player's Discord user ID
     */
    private async ensurePlayerStat(userId: string) {
        const results = await dbContext.kmq("player_stats")
            .select("*")
            .where("player_id", "=", userId)
            .limit(1);

        if (results.length === 0) {
            const currentDateString = getSqlDateString();
            await dbContext.kmq("player_stats")
                .insert(
                    {
                        player_id: userId,
                        first_play: currentDateString,
                        last_active: currentDateString,
                    },
                );
        }
    }

    /**
     * Updates a user's songs guessed in the data store
     * @param userId - The player's Discord user ID
     * @param score - The player's score in the current GameSession
     */
    private async incrementPlayerSongsGuessed(userId: string, score: number) {
        await dbContext.kmq("player_stats")
            .where("player_id", "=", userId)
            .increment("songs_guessed", score)
            .update({
                last_active: getSqlDateString(),
            });
    }

    /**
     * Updates a user's games played in the data store
     * @param userId - The player's Discord user ID
     */
    private async incrementPlayerGamesPlayed(userId: string) {
        await dbContext.kmq("player_stats")
            .where("player_id", "=", userId)
            .increment("games_played", 1);
    }

    /**
     * @returns Debug string containing basic information about the GameRound
     */
    private getDebugSongDetails(): string {
        if (!this.gameRound) return "No active game round";
        return `${this.gameRound.songName}:${this.gameRound.artist}:${this.gameRound.videoID}`;
    }
}
