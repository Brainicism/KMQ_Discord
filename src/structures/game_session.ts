import Eris from "eris";
import fs from "fs";
import { SeekType } from "../commands/game_options/seek";
import { ShuffleType } from "../commands/game_options/shuffle";
import dbContext from "../database_context";
import { isDebugMode, skipSongPlay } from "../helpers/debug_utils";
import {
    getDebugLogHeader, getSqlDateString, sendErrorMessage, sendEndOfRoundMessage, sendInfoMessage, getNumParticipants, checkBotIsAlone, getVoiceChannelFromMessage,
} from "../helpers/discord_utils";
import { ensureVoiceConnection, getGuildPreference, selectRandomSong, getFilteredSongList, getSongCount, endSession } from "../helpers/game_utils";
import { delay, getAudioDurationInSeconds, isPowerHour, isWeekend } from "../helpers/utils";
import state from "../kmq";
import _logger from "../logger";
import { QueriedSong, GuildTextableMessage } from "../types";
import GameRound from "./game_round";
import GuildPreference from "./guild_preference";
import Scoreboard from "./scoreboard";
import EliminationScoreboard from "./elimination_scoreboard";
import TeamScoreboard from "./team_scoreboard";
import { deleteGameSession } from "../helpers/management_utils";
import { GameType } from "../commands/game_commands/play";
import { ModeType } from "../commands/game_options/mode";
import { getRankNameByLevel } from "../commands/game_commands/profile";
import { Gender } from "../commands/game_options/gender";
import EliminationPlayer from "./elimination_player";
import { KmqImages } from "../constants";
import MessageContext from "./message_context";
import KmqMember from "./kmq_member";

const logger = _logger("game_session");
const LAST_PLAYED_SONG_QUEUE_SIZE = 10;

const EXP_TABLE = [...Array(200).keys()].map((level) => {
    if (level === 0 || level === 1) return 0;
    return 10 * (level ** 2) + 200 * level - 200;
});

// eslint-disable-next-line no-return-assign
export const CUM_EXP_TABLE = EXP_TABLE.map(((sum) => (value) => sum += value)(0));

interface LevelUpResult {
    userID: string;
    startLevel: number;
    endLevel: number;
}

interface LastGuesser {
    userID: string;
    streak: number;
}

export interface GuessResult {
    correct: boolean;
    expGain?: number;
    guesserUserID?: string;
    pointsEarned?: number;
    streak?: number;
    remainingDuration?: number;
}

export default class GameSession {
    /** The GameType that the GameSession started in */
    public readonly gameType: GameType;

    /** The user who initiated the GameSession */
    public readonly owner: KmqMember;

    /** The Scoreboard object keeping track of players and scoring */
    public readonly scoreboard: Scoreboard;

    /** The ID of text channel in which the GameSession was started in, and will be active in */
    public readonly textChannelID: string;

    /** The ID of the voice channel in which the GameSession was started in, and will be active in */
    public readonly voiceChannelID: string;

    /** The Discord Guild ID */
    public readonly guildID: string;

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

    /** The number of songs correctly guessed */
    private correctGuesses: number;

    /** List of guess times per GameRound */
    private guessTimes: Array<number>;

    /** Timer function used to for ,timer command */
    private guessTimeoutFunc: NodeJS.Timer;

    /** List of recently played songs used to prevent frequent repeats */
    private lastPlayedSongs: Array<string>;

    /** List of songs played with ,shuffle unique enabled */
    private uniqueSongs: Set<string>;

    /** The last gender played when gender is set to alternating, can be null (in not alternating mode), GENDER.MALE, or GENDER.FEMALE */
    private lastAlternatingGender: Gender;

    /** The most recent Guesser, including their current streak */
    private lastGuesser: LastGuesser;

    constructor(textChannelID: string, voiceChannelID: string, guildID: string, gameSessionCreator: KmqMember, gameType: GameType, eliminationLives?: number) {
        this.gameType = gameType;
        this.guildID = guildID;
        if (this.gameType === GameType.ELIMINATION) {
            this.scoreboard = new EliminationScoreboard(eliminationLives);
        } else if (this.gameType === GameType.TEAMS) {
            this.scoreboard = new TeamScoreboard();
        } else {
            this.scoreboard = new Scoreboard();
        }
        this.lastActive = Date.now();
        this.sessionInitialized = false;
        this.startedAt = Date.now();
        this.participants = new Set();
        this.roundsPlayed = 0;
        this.correctGuesses = 0;
        this.guessTimes = [];
        this.connection = null;
        this.finished = false;
        this.voiceChannelID = voiceChannelID;
        this.textChannelID = textChannelID;
        this.gameRound = null;
        this.owner = gameSessionCreator;
        this.lastPlayedSongs = [];
        this.uniqueSongs = new Set();
        this.lastAlternatingGender = null;
        this.lastGuesser = null;
    }

    /**
     * Ends an active GameRound
     * @param guessResult - Whether the round ended via a correct guess (includes exp gain), or other (timeout, error, etc)
     * @param guildPreference - The GuildPreference
     * @param messageContext - An object containing relevant parts of Eris.Message
     */
    endRound(guessResult: GuessResult, guildPreference: GuildPreference, messageContext?: MessageContext) {
        this.roundsPlayed++;
        if (this.gameRound === null) {
            return;
        }

        if (guessResult.correct) {
            // update guessing streaks
            if (this.lastGuesser === null || this.lastGuesser.userID !== guessResult.guesserUserID) {
                this.lastGuesser = { userID: guessResult.guesserUserID, streak: 1 };
            } else {
                this.lastGuesser.streak++;
            }
            // calculate xp gain
            const guessSpeed = Date.now() - this.gameRound.startedAt;
            this.guessTimes.push(guessSpeed);
            const expGain = this.calculateExpGain(guildPreference, this.gameRound.baseExp, getNumParticipants(this.voiceChannelID), guessSpeed);
            guessResult.expGain = expGain;
            guessResult.streak = this.lastGuesser.streak;
            logger.info(`${getDebugLogHeader(messageContext)} | Song correctly guessed. song = ${this.gameRound.songName}. Gained ${expGain} EXP`);

            // update scoreboard
            const { author } = messageContext;
            this.scoreboard.updateScoreboard(author.tag, author.id, author.avatarUrl, guessResult.pointsEarned, expGain);
        } else {
            this.lastGuesser = null;
        }

        // calculate remaining game duration if applicable
        const currGameLength = (Date.now() - this.startedAt) / 60000;
        const remainingDuration = guildPreference.isDurationSet() ? (guildPreference.getDuration() - currGameLength) : null;
        guessResult.remainingDuration = remainingDuration;

        if (messageContext) {
            sendEndOfRoundMessage(messageContext, this.scoreboard, this.gameRound, guessResult);
        }

        // cleanup
        this.stopGuessTimeout();
        this.gameRound = null;
        if (this.connection) {
            this.connection.removeAllListeners();
        }

        if (this.finished) return;
        // check if duration has been reached
        if (remainingDuration && remainingDuration < 0) {
            logger.info(`gid: ${this.guildID} | Game session duration reached`);
            endSession(this);
        } else if (this.scoreboard.gameFinished(guildPreference)) {
            endSession(this);
        }
    }

    /**
     * Ends the current GameSession
     */
    endSession = async (): Promise<void> => {
        this.finished = true;
        this.endRound({ correct: false }, await getGuildPreference(this.guildID));
        const voiceConnection = state.client.voiceConnections.get(this.guildID);

        // leave voice channel
        if (voiceConnection && voiceConnection.channelID) {
            voiceConnection.stopPlaying();
            const voiceChannel = state.client.getChannel(voiceConnection.channelID) as Eris.VoiceChannel;
            if (voiceChannel) {
                voiceChannel.leave();
            }
        }

        const leveledUpPlayers: Array<LevelUpResult> = [];
        // commit player stats
        for (const participant of this.participants) {
            await this.ensurePlayerStat(participant);
            await this.incrementPlayerGamesPlayed(participant);
            const playerScore = this.scoreboard.getPlayerScore(participant);
            if (playerScore > 0) {
                await this.incrementPlayerSongsGuessed(participant, playerScore);
            }
            const playerExpGain = this.scoreboard.getPlayerExpGain(participant);
            if (playerExpGain > 0) {
                const levelUpResult = await this.incrementPlayerExp(participant, playerExpGain);
                if (levelUpResult) {
                    leveledUpPlayers.push(levelUpResult);
                }
            }
        }

        // send level up message
        if (leveledUpPlayers.length > 0) {
            let levelUpMessages = leveledUpPlayers.map((leveledUpPlayer) => `\`${this.scoreboard.getPlayerName(leveledUpPlayer.userID)}\` has leveled from \`${leveledUpPlayer.startLevel}\` to \`${leveledUpPlayer.endLevel} (${getRankNameByLevel(leveledUpPlayer.endLevel)})\``);
            if (levelUpMessages.length > 10) {
                levelUpMessages = levelUpMessages.slice(0, 10);
                levelUpMessages.push("and many others...");
            }
            sendInfoMessage(new MessageContext(this.textChannelID), { title: "🚀 Power up!", description: levelUpMessages.join("\n"), thumbnailUrl: KmqImages.THUMBS_UP });
        }

        // commit guild stats
        await dbContext.kmq("guild_preferences")
            .where("guild_id", this.guildID)
            .increment("games_played", 1);

        // commit guild's game session
        const sessionLength = (Date.now() - this.startedAt) / (1000 * 60);
        const averageGuessTime = this.guessTimes.length > 0 ? this.guessTimes.reduce((a, b) => a + b, 0) / (this.guessTimes.length * 1000) : -1;

        await dbContext.kmq("game_sessions")
            .insert({
                start_date: getSqlDateString(this.startedAt),
                guild_id: this.guildID,
                num_participants: this.participants.size,
                avg_guess_time: averageGuessTime,
                session_length: sessionLength,
                rounds_played: this.roundsPlayed,
            });

        logger.info(`gid: ${this.guildID} | Game session ended. rounds_played = ${this.roundsPlayed}. session_length = ${sessionLength}. gameType = ${this.gameType}`);
        deleteGameSession(this.guildID);
    };

    /**
     * Updates the GameSession's lastActive timestamp and it's value in the data store
     */
    async lastActiveNow(): Promise<void> {
        this.lastActive = Date.now();
        await dbContext.kmq("guild_preferences")
            .where({ guild_id: this.guildID })
            .update({ last_active: new Date() });
    }

    /**
     * Process a message to see if it is a valid and correct guess
     * @param message - The message to check
     */
    async guessSong(message: GuildTextableMessage) {
        if (!this.connection) return;
        if (this.connection.listenerCount("end") === 0) return;
        const guildPreference = await getGuildPreference(message.guildID);
        if (!this.gameRound) return;

        if (!this.guessEligible(message)) return;

        const pointsEarned = this.checkGuess(message, guildPreference.getModeType());
        if (pointsEarned > 0) {
            this.correctGuesses++;

            // mark round as complete, so no more guesses can go through
            this.endRound({ correct: true, guesserUserID: message.author.id, pointsEarned }, guildPreference, MessageContext.fromMessage(message));

            // update game session's lastActive
            const gameSession = state.gameSessions[this.guildID];
            gameSession.lastActiveNow();

            this.stopGuessTimeout();

            // increment guild's song guess count
            await dbContext.kmq("guild_preferences")
                .where("guild_id", this.guildID)
                .increment("songs_guessed", 1);

            this.startRound(guildPreference, MessageContext.fromMessage(message));
        }
    }

    /**
     * Starting a new GameRound
     * @param guildPreference - The guild's GuildPreference
     * @param messageContext - An object containing relevant parts of Eris.Message
     */
    async startRound(guildPreference: GuildPreference, messageContext: MessageContext) {
        this.sessionInitialized = true;
        await delay(3000);
        if (this.finished || this.gameRound) {
            return;
        }

        const totalSongs = await getFilteredSongList(guildPreference);
        const totalSongsCount = totalSongs.songs.length;

        // manage unique songs
        if (guildPreference.getShuffleType() === ShuffleType.UNIQUE) {
            const songsNotPlayed = totalSongs.songs.filter((song) => !this.uniqueSongs.has(song.youtubeLink));
            if (songsNotPlayed.length === 0) {
                logger.info(`${getDebugLogHeader(messageContext)} | Resetting uniqueSongs (all ${totalSongsCount} unique songs played)`);
                this.resetUniqueSongs();
            }
        } else {
            this.resetUniqueSongs();
        }

        // manage last played songs
        if (totalSongsCount <= LAST_PLAYED_SONG_QUEUE_SIZE) {
            this.lastPlayedSongs = [];
        } else if (this.lastPlayedSongs.length === LAST_PLAYED_SONG_QUEUE_SIZE) {
            this.lastPlayedSongs.shift();

            // Randomize songs from oldest LAST_PLAYED_SONG_QUEUE_SIZE / 2 songs
            // when lastPlayedSongsQueue is in use but totalSongsCount small
            if (totalSongsCount <= LAST_PLAYED_SONG_QUEUE_SIZE * 2) {
                this.lastPlayedSongs.splice(0, LAST_PLAYED_SONG_QUEUE_SIZE / 2);
            }
        }

        // manage alternating gender
        if (guildPreference.isGenderAlternating()) {
            if (this.lastAlternatingGender === null) {
                this.lastAlternatingGender = Math.random() < 0.5 ? Gender.MALE : Gender.FEMALE;
            } else {
                this.lastAlternatingGender = this.lastAlternatingGender === Gender.MALE ? Gender.FEMALE : Gender.MALE;
            }
        } else {
            this.lastAlternatingGender = null;
        }

        // query for random song
        let randomSong: QueriedSong;
        try {
            const ignoredSongs = new Set([...this.lastPlayedSongs, ...this.uniqueSongs]);
            if (this.lastAlternatingGender) {
                randomSong = await selectRandomSong(guildPreference, ignoredSongs, this.lastAlternatingGender);
            } else {
                randomSong = await selectRandomSong(guildPreference, ignoredSongs);
            }
            if (randomSong === null) {
                sendErrorMessage(messageContext, { title: "Song Query Error", description: "Failed to find songs matching this criteria. Try to broaden your search." });
                this.endSession();
                return;
            }
        } catch (err) {
            await sendErrorMessage(messageContext, { title: "Error selecting song", description: "Please try starting the round again. If the issue persists, report it in our official KMQ server." });
            logger.error(`${getDebugLogHeader(messageContext)} | Error querying song: ${err.toString()}. guildPreference = ${JSON.stringify(guildPreference)}`);
            this.endSession();
            return;
        }

        if (totalSongsCount > LAST_PLAYED_SONG_QUEUE_SIZE) {
            this.lastPlayedSongs.push(randomSong.youtubeLink);
        }
        if (guildPreference.getShuffleType() === ShuffleType.UNIQUE) {
            this.uniqueSongs.add(randomSong.youtubeLink);
        }

        // create a new round with randomly chosen song
        this.prepareRound(randomSong.name, randomSong.artist, randomSong.youtubeLink, randomSong.publishDate.getFullYear());
        this.gameRound.setBaseExpReward(await this.calculateBaseExp(guildPreference));

        const voiceChannel = state.client.getChannel(this.voiceChannelID) as Eris.VoiceChannel;
        if (checkBotIsAlone(this, voiceChannel)) {
            return;
        }
        if (voiceChannel.voiceMembers.size === 0) {
            await this.endSession();
            return;
        }

        // join voice channel and start round
        try {
            await ensureVoiceConnection(this);
        } catch (err) {
            await this.endSession();
            logger.error(`${getDebugLogHeader(messageContext)} | Error obtaining voice connection. err = ${err.toString()}`);
            await sendErrorMessage(messageContext, { title: "Error joining voice channel", description: "Something went wrong, try starting the game again in a bit." });
            return;
        }
        this.playSong(guildPreference, messageContext);
    }

    /**
     * Sets a timeout for guessing in timer mode
     * @param messageContext - An object containing relevant parts of Eris.Message
     * @param guildPreference - The GuildPreference
     */
    startGuessTimeout(messageContext: MessageContext, guildPreference: GuildPreference) {
        if (!guildPreference.isGuessTimeoutSet()) return;

        const time = guildPreference.getGuessTimeout();
        this.guessTimeoutFunc = setTimeout(async () => {
            if (this.finished) return;
            logger.info(`${getDebugLogHeader(messageContext)} | Song finished without being guessed, timer of: ${time} seconds.`);
            if (this.gameType === GameType.ELIMINATION) {
                const eliminationScoreboard = this.scoreboard as EliminationScoreboard;
                eliminationScoreboard.decrementAllLives();
            }
            this.endRound({ correct: false }, guildPreference, messageContext);
            this.startRound(await getGuildPreference(this.guildID), messageContext);
        }, time * 1000);
    }

    /**
     * Stops the timer set in timer mode
     */
    stopGuessTimeout() {
        clearTimeout(this.guessTimeoutFunc);
    }

    /**
     * Resets the unique songs set
     */
    resetUniqueSongs() {
        this.uniqueSongs.clear();
    }

    /**
     * Adds a participant for elimination mode
     * @param user - The user to add
     */
    addEliminationParticipant(user: KmqMember, midgame = false): EliminationPlayer {
        this.participants.add(user.id);
        const eliminationScoreboard = this.scoreboard as EliminationScoreboard;
        return eliminationScoreboard.addPlayer(user.id, user.tag, user.avatarUrl, midgame ? eliminationScoreboard.getLivesOfWeakestPlayer() : null);
    }

    getRoundsPlayed() {
        return this.roundsPlayed;
    }

    getCorrectGuesses() {
        return this.correctGuesses;
    }

    /**
     * Begin playing the GameRound's song in the VoiceChannel, listen on VoiceConnection events
     * @param guildPreference - The guild's GuildPreference
     * @param messageContext - An object containing relevant parts of Eris.Message
     */
    private async playSong(guildPreference: GuildPreference, messageContext: MessageContext) {
        const { gameRound } = this;
        if (gameRound === null) {
            return;
        }

        if (isDebugMode() && skipSongPlay()) {
            logger.debug(`${getDebugLogHeader(messageContext)} | Not playing song in voice connection. song = ${this.getDebugSongDetails()}`);
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

        logger.info(`${getDebugLogHeader(messageContext)} | Playing song in voice connection. seek = ${guildPreference.getSeekType()}. song = ${this.getDebugSongDetails()}. mode = ${guildPreference.getModeType()}`);
        this.connection.removeAllListeners();
        this.connection.stopPlaying();
        try {
            this.connection.play(stream, {
                inputArgs: ["-ss", seekLocation.toString()],
            });
        } catch (e) {
            logger.error(`Erroring playing on voice connection. err = ${e}`);
            await this.errorRestartRound(messageContext, guildPreference);
            return;
        }

        this.startGuessTimeout(messageContext, guildPreference);

        // song finished without being guessed
        this.connection.once("end", async () => {
            logger.info(`${getDebugLogHeader(messageContext)} | Song finished without being guessed.`);
            this.stopGuessTimeout();
            this.endRound({ correct: false }, guildPreference, messageContext);
            this.startRound(await getGuildPreference(this.guildID), messageContext);
        });

        // admin manually 'disconnected' bot from voice channel or misc error
        this.connection.once("error", async (err) => {
            if (!this.connection.channelID) {
                logger.info(`${getDebugLogHeader(messageContext)} | Bot was kicked from voice channel`);
                this.stopGuessTimeout();
                endSession(this);
                return;
            }

            logger.error(`${getDebugLogHeader(messageContext)} | Unknown error with stream dispatcher. song = ${this.getDebugSongDetails()}. err = ${err}`);
            this.errorRestartRound(messageContext, guildPreference);
        });
    }

    /**
     * Attempt to restart game with different song
     * @param messageContext - The MessageContext
     * @param guildPreference - The GuildPreference
     */
    private async errorRestartRound(messageContext: MessageContext, guildPreference: GuildPreference) {
        await sendErrorMessage(messageContext, { title: "Error playing song", description: "Starting new round in 3 seconds..." });
        this.roundsPlayed--;
        this.endRound({ correct: false }, guildPreference, messageContext);
        this.startRound(guildPreference, messageContext);
    }
    /**
     * Prepares a new GameRound
     * @param song - The name of the song
     * @param artist - The name of the artist
     * @param videoID - The song's corresponding YouTube ID
     * @param year - The song's release year
     */
    private prepareRound(song: string, artist: string, videoID: string, year: number) {
        this.gameRound = new GameRound(song, artist, videoID, year);
    }

    /**
     *
     * @param message - The message to check for correct guess
     * @param modeType - The guessing mode type to evaluate the guess against
     * @returns The number of points achieved for the guess
     */
    private checkGuess(message: Eris.Message, modeType: ModeType): number {
        if (!this.gameRound) return 0;
        if (this.gameType !== GameType.ELIMINATION) {
            this.participants.add(message.author.id);
        }
        return this.gameRound.checkGuess(message.content, modeType);
    }

    /**
     * Checks whether the author of the message is eligible to guess in the
     * current game session
     * @param message - The message to check for guess eligibility
     */
    private guessEligible(message: GuildTextableMessage): boolean {
        const userVoiceChannel = getVoiceChannelFromMessage(message);
        // if user isn't in the same voice channel
        if (!userVoiceChannel || (userVoiceChannel.id !== this.voiceChannelID)) {
            return false;
        }

        // if message isn't in the active game session's text channel
        if (message.channel.id !== this.textChannelID) {
            return false;
        }

        // check elimination mode constraints
        if (this.gameType === GameType.ELIMINATION) {
            const eliminationScoreboard = this.scoreboard as EliminationScoreboard;
            if (!this.participants.has(message.author.id) || eliminationScoreboard.isPlayerEliminated(message.author.id)) {
                return false;
            }
        } else if (this.gameType === GameType.TEAMS) {
            const teamScoreboard = this.scoreboard as TeamScoreboard;
            if (!teamScoreboard.getPlayer(message.author.id)) {
                return false;
            }
        }

        return true;
    }

    /**
     * Creates/updates a user's activity in the data store
     * @param userID - The player's Discord user ID
     */
    private async ensurePlayerStat(userID: string) {
        const currentDateString = getSqlDateString();
        await dbContext.kmq("player_stats")
            .insert(
                {
                    player_id: userID,
                    first_play: currentDateString,
                    last_active: currentDateString,
                },
            )
            .onConflict("player_id")
            .ignore();

        await dbContext.kmq("player_servers")
            .insert({
                player_id: userID,
                server_id: this.guildID,
            })
            .onConflict(["player_id", "server_id"])
            .ignore();
    }

    /**
     * Updates a user's songs guessed in the data store
     * @param userID - The player's Discord user ID
     * @param score - The player's score in the current GameSession
     */
    private async incrementPlayerSongsGuessed(userID: string, score: number) {
        await dbContext.kmq("player_stats")
            .where("player_id", "=", userID)
            .increment("songs_guessed", score)
            .update({
                last_active: getSqlDateString(),
            });
    }

    /**
     * Updates a user's games played in the data store
     * @param userID - The player's Discord user ID
     */
    private async incrementPlayerGamesPlayed(userID: string) {
        await dbContext.kmq("player_stats")
            .where("player_id", "=", userID)
            .increment("games_played", 1);
    }

    /**
     * @param userID - The Discord ID of the user to exp gain
     * @param expGain - The amount of EXP gained
     */
    private async incrementPlayerExp(userID: string, expGain: number): Promise<LevelUpResult> {
        const { exp: currentExp, level } = (await dbContext.kmq("player_stats")
            .select(["exp", "level"])
            .where("player_id", "=", userID)
            .first());
        const newExp = currentExp + expGain;
        let newLevel = level;

        // check for level up
        while (newExp > CUM_EXP_TABLE[newLevel + 1]) {
            newLevel++;
        }

        // persist exp and level to data store
        await dbContext.kmq("player_stats")
            .update({ exp: newExp, level: newLevel })
            .where("player_id", "=", userID);

        if (level !== newLevel) {
            logger.info(`${userID} has leveled from ${level} to ${newLevel}`);
            return {
                userID,
                startLevel: level,
                endLevel: newLevel,
            };
        }

        return null;
    }

    /**
     * @returns Debug string containing basic information about the GameRound
     */
    private getDebugSongDetails(): string {
        if (!this.gameRound) return "No active game round";
        return `${this.gameRound.songName}:${this.gameRound.artist}:${this.gameRound.videoID}`;
    }

    /**
     * @param guildPreference - The guild preference
     * @param baseExp - The base amount of EXP the GameRound provides
     * @param numParticipants - The number of participants in the voice channel at the time of guess
     * @param guessSpeed - The time taken to guess correctly
     * @returns The amount of EXP gained based on the current game options
     */
    private calculateExpGain(guildPreference: GuildPreference, baseExp: number, numParticipants: number, guessSpeed: number): number {
        let expModifier = 1;
        // penalize/incentivize for number of participants from 0.75x to 1.25x
        expModifier *= numParticipants === 1 ? 0.75 : (0.0625 * (Math.min(numParticipants, 6)) + 0.875);

        // penalize for using artist guess modes
        if (guildPreference.getModeType() === ModeType.ARTIST || guildPreference.getModeType() === ModeType.BOTH) {
            if (guildPreference.isGroupsMode()) return 0;
            expModifier *= 0.3;
        }

        // bonus for quick guess
        if (guessSpeed < 3500) {
            expModifier *= 1.1;
        }

        // bonus for guess streaks
        if (this.lastGuesser.streak >= 5) {
            expModifier *= 1.2;
        }

        return Math.floor(expModifier * baseExp);
    }

    /**
     * https://www.desmos.com/calculator/zxvbuq0bch
     * @param guildPreference - The GuildPreference
     * @returns the base EXP reward for the gameround
     */
    private async calculateBaseExp(guildPreference: GuildPreference): Promise<number> {
        const songCount = await getSongCount(guildPreference);
        // minimum amount of songs for exp gain
        if (songCount.count < 10) return 0;
        const expBase = 1000 / (1 + (Math.exp(1 - (0.00125 * songCount.count))));
        let expJitter = expBase * (0.05 * Math.random());
        expJitter *= Math.round(Math.random()) ? 1 : -1;

        // double xp weekend multiplier
        const multiplier = (isWeekend() || isPowerHour()) ? 2 : 1;
        return (expBase + expJitter) * multiplier;
    }
}
