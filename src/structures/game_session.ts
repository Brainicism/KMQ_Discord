import Eris from "eris";
import fs from "fs";
import { SeekType } from "../commands/game_options/seek";
import { ShuffleType } from "../commands/game_options/shuffle";
import dbContext from "../database_context";
import { isDebugMode, skipSongPlay } from "../helpers/debug_utils";
import {
    getDebugLogHeader, getSqlDateString, sendErrorMessage, sendEndRoundMessage, sendInfoMessage, getNumParticipants, getUserVoiceChannel, sendEndGameMessage,
} from "../helpers/discord_utils";
import { ensureVoiceConnection, getGuildPreference, selectRandomSong, getFilteredSongList } from "../helpers/game_utils";
import { delay, getOrdinalNum, isPowerHour, isWeekend, setDifference, bold, codeLine } from "../helpers/utils";
import state from "../kmq";
import _logger from "../logger";
import { QueriedSong, GuildTextableMessage, PlayerRoundResult, GameType } from "../types";
import GameRound from "./game_round";
import GuildPreference from "./guild_preference";
import Scoreboard from "./scoreboard";
import EliminationScoreboard from "./elimination_scoreboard";
import TeamScoreboard from "./team_scoreboard";
import { deleteGameSession } from "../helpers/management_utils";
import { GuessModeType } from "../commands/game_options/guessmode";
import { getRankNameByLevel } from "../commands/game_commands/profile";
import { Gender } from "../commands/game_options/gender";
import EliminationPlayer from "./elimination_player";
import { KmqImages } from "../constants";
import MessageContext from "./message_context";
import KmqMember from "./kmq_member";
import { MultiGuessType } from "../commands/game_options/multiguess";
import { specialFfmpegArgs } from "../commands/game_options/special";

const MULTIGUESS_DELAY = 1500;
const logger = _logger("game_session");
const LAST_PLAYED_SONG_QUEUE_SIZE = 10;

const EXP_TABLE = [...Array(1000).keys()].map((level) => {
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
    correctGuessers?: Array<KmqMember>;
}

export interface UniqueSongCounter {
    uniqueSongsPlayed: number;
    totalSongs: number;
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

    /** List of songs matching the user's game options */
    private filteredSongs: { songs: Set<QueriedSong>, countBeforeLimit: number };

    /** List of recently played songs used to prevent frequent repeats */
    private lastPlayedSongs: Array<string>;

    /** List of songs played with ,shuffle unique enabled */
    private uniqueSongsPlayed: Set<string>;

    /** Map of song's YouTube ID to correctGuesses and roundsPlayed */
    private playCount: { [vlink: string]: { correctGuesses: number, roundsPlayed: number } };

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
        this.filteredSongs = null;
        this.lastPlayedSongs = [];
        this.uniqueSongsPlayed = new Set();
        this.playCount = {};
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
        if (this.connection) {
            this.connection.removeAllListeners();
        }
        if (this.gameRound === null) {
            return;
        }
        const playerRoundResults: Array<PlayerRoundResult> = [];
        if (guessResult.correct) {
            // update guessing streaks
            if (this.lastGuesser === null || this.lastGuesser.userID !== guessResult.correctGuessers[0].id) {
                this.lastGuesser = { userID: guessResult.correctGuessers[0].id, streak: 1 };
            } else {
                this.lastGuesser.streak++;
            }
            // calculate exp gain
            const guessSpeed = Date.now() - this.gameRound.startedAt;
            this.guessTimes.push(guessSpeed);

            // update scoreboard
            const scoreboardUpdatePayload = guessResult.correctGuessers.map((correctGuesser, idx) => {
                const guessPosition = idx + 1;
                const expGain = this.calculateExpGain(guildPreference,
                    this.gameRound.getExpReward(),
                    getNumParticipants(this.voiceChannelID),
                    guessSpeed,
                    guessPosition,
                    state.bonusUsers.has(correctGuesser.id));
                if (idx === 0) {
                    playerRoundResults.push({ player: correctGuesser, streak: this.lastGuesser.streak, expGain });
                    logger.info(`${getDebugLogHeader(messageContext)}, uid: ${correctGuesser.id} | Song correctly guessed. song = ${this.gameRound.songName}. Gained ${expGain} EXP`);
                } else {
                    playerRoundResults.push({ player: correctGuesser, streak: 0, expGain });
                    logger.info(`${getDebugLogHeader(messageContext)}, uid: ${correctGuesser.id} | Song correctly guessed ${getOrdinalNum(guessPosition)}. song = ${this.gameRound.songName}. Gained ${expGain} EXP`);
                }
                return {
                    userID: correctGuesser.id, pointsEarned: idx === 0 ? correctGuesser.pointsAwarded : correctGuesser.pointsAwarded / 2, expGain,
                };
            });
            this.scoreboard.updateScoreboard(scoreboardUpdatePayload);
        } else {
            this.lastGuesser = null;
        }

        // calculate remaining game duration if applicable
        const currGameLength = (Date.now() - this.startedAt) / 60000;
        const remainingDuration = guildPreference.isDurationSet() ? (guildPreference.getDuration() - currGameLength) : null;

        if (messageContext) {
            let uniqueSongCounter: UniqueSongCounter;
            if (guildPreference.isShuffleUnique()) {
                const filteredSongs = new Set([...this.filteredSongs.songs].map((x) => x.youtubeLink));
                uniqueSongCounter = {
                    uniqueSongsPlayed: this.uniqueSongsPlayed.size - setDifference([...this.uniqueSongsPlayed], [...filteredSongs]).size,
                    totalSongs: Math.min(this.filteredSongs.countBeforeLimit, guildPreference.getLimitEnd() - guildPreference.getLimitStart()),
                };
            }

            sendEndRoundMessage(messageContext, this.scoreboard, this.gameRound, guildPreference.getGuessModeType(), playerRoundResults, remainingDuration, uniqueSongCounter);
        }

        this.incrementSongCount(this.gameRound.videoID, guessResult.correct);

        // cleanup
        this.stopGuessTimeout();
        this.gameRound = null;

        if (this.finished) return;
        this.roundsPlayed++;
        // check if duration has been reached
        if (remainingDuration && remainingDuration < 0) {
            logger.info(`gid: ${this.guildID} | Game session duration reached`);
            this.endSession();
        } else if (this.scoreboard.gameFinished(guildPreference)) {
            this.endSession();
        }
    }

    /**
     * Ends the current GameSession
     */
    endSession = async (): Promise<void> => {
        if (this.finished) {
            return;
        }
        this.finished = true;
        deleteGameSession(this.guildID);
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
            let levelUpMessages = leveledUpPlayers.map((leveledUpPlayer) => `${bold(this.scoreboard.getPlayerName(leveledUpPlayer.userID))} has leveled from ${codeLine(String(leveledUpPlayer.startLevel))} to ${codeLine(String(leveledUpPlayer.endLevel))} (${codeLine(getRankNameByLevel(leveledUpPlayer.endLevel))})`);
            if (levelUpMessages.length > 10) {
                levelUpMessages = levelUpMessages.slice(0, 10);
                levelUpMessages.push("and many others...");
            }
            sendInfoMessage(new MessageContext(this.textChannelID), { title: "🚀 Power up!", description: levelUpMessages.join("\n"), thumbnailUrl: KmqImages.THUMBS_UP });
        }

        await sendEndGameMessage(this);

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
                correct_guesses: this.correctGuesses,
            });

        // commit session's song plays and correct guesses
        await this.storeSongCounts();

        logger.info(`gid: ${this.guildID} | Game session ended. rounds_played = ${this.roundsPlayed}. session_length = ${sessionLength}. gameType = ${this.gameType}`);
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

        const pointsEarned = this.checkGuess(message.author.id, message.content, guildPreference.getGuessModeType());
        if (pointsEarned > 0) {
            if (this.gameRound.finished) {
                return;
            }
            this.gameRound.finished = true;

            await delay(this.multiguessDelayIsActive(guildPreference) ? MULTIGUESS_DELAY : 0);

            if (!this.gameRound) return;
            // mark round as complete, so no more guesses can go through
            this.endRound({ correct: true, correctGuessers: this.gameRound.correctGuessers }, guildPreference, MessageContext.fromMessage(message));
            this.correctGuesses++;

            // update game session's lastActive
            this.lastActiveNow();

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
        await delay(this.multiguessDelayIsActive(guildPreference) ? 3000 - MULTIGUESS_DELAY : 3000);
        if (this.finished || this.gameRound) {
            return;
        }

        if (this.filteredSongs === null) {
            try {
                this.filteredSongs = await getFilteredSongList(guildPreference);
            } catch (err) {
                await sendErrorMessage(messageContext, { title: "Error selecting song", description: "Please try starting the round again. If the issue persists, report it in our official KMQ server." });
                logger.error(`${getDebugLogHeader(messageContext)} | Error querying song: ${err.toString()}. guildPreference = ${JSON.stringify(guildPreference)}`);
                await this.endSession();
                return;
            }
        }

        const totalSongsCount = this.filteredSongs.songs.size;

        // manage unique songs
        if (guildPreference.getShuffleType() === ShuffleType.UNIQUE) {
            const filteredSongs = new Set([...this.filteredSongs.songs].map((x) => x.youtubeLink));
            if (setDifference([...filteredSongs], [...this.uniqueSongsPlayed]).size === 0) {
                logger.info(`${getDebugLogHeader(messageContext)} | Resetting uniqueSongsPlayed (all ${totalSongsCount} unique songs played)`);
                // In updateSongCount, songs already played are added to songCount when options change. On unique reset, remove them
                await sendInfoMessage(messageContext, { title: "Resetting unique songs", description: `All songs have been played. ${totalSongsCount} songs will be reshuffled.`, thumbnailUrl: KmqImages.LISTENING });
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
            // when lastPlayedSongs is in use but totalSongsCount small
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
        const ignoredSongs = new Set([...this.lastPlayedSongs, ...this.uniqueSongsPlayed]);
        if (this.lastAlternatingGender) {
            randomSong = await selectRandomSong(this.filteredSongs.songs, ignoredSongs, this.lastAlternatingGender);
        } else {
            randomSong = await selectRandomSong(this.filteredSongs.songs, ignoredSongs);
        }
        if (randomSong === null) {
            sendErrorMessage(messageContext, { title: "Song Query Error", description: "Failed to find songs matching this criteria. Try to broaden your search." });
            await this.endSession();
            return;
        }

        if (totalSongsCount > LAST_PLAYED_SONG_QUEUE_SIZE) {
            this.lastPlayedSongs.push(randomSong.youtubeLink);
        }
        if (guildPreference.getShuffleType() === ShuffleType.UNIQUE) {
            this.uniqueSongsPlayed.add(randomSong.youtubeLink);
        }

        // create a new round with randomly chosen song
        this.prepareRound(randomSong.name, randomSong.artist, randomSong.youtubeLink, randomSong.publishDate.getFullYear());
        this.gameRound.setBaseExpReward(await this.calculateBaseExp());

        const voiceChannel = state.client.getChannel(this.voiceChannelID) as Eris.VoiceChannel;
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
            if (this.finished || this.gameRound.finished) return;
            logger.info(`${getDebugLogHeader(messageContext)} | Song finished without being guessed, timer of: ${time} seconds.`);
            if (this.gameType === GameType.ELIMINATION) {
                const eliminationScoreboard = this.scoreboard as EliminationScoreboard;
                eliminationScoreboard.decrementAllLives();
            }
            this.endRound({ correct: false }, guildPreference, new MessageContext(this.textChannelID));
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
        this.uniqueSongsPlayed.clear();
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

    async updateFilteredSongs(guildPreference: GuildPreference) {
        this.filteredSongs = await getFilteredSongList(guildPreference);
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
        const seekType = guildPreference.getSeekType();
        if (seekType === SeekType.BEGINNING) {
            seekLocation = 0;
        } else {
            const songDuration = (await dbContext.kmq("cached_song_duration")
                .select(["duration"])
                .where("vlink", "=", gameRound.videoID)
                .first()).duration;
            if (guildPreference.getSeekType() === SeekType.RANDOM) {
                seekLocation = songDuration * (0.6 * Math.random());
            } else if (guildPreference.getSeekType() === SeekType.MIDDLE) {
                seekLocation = songDuration * (0.4 + 0.2 * Math.random());
            }
        }

        const stream = fs.createReadStream(songLocation);

        logger.info(`${getDebugLogHeader(messageContext)} | Playing song in voice connection. seek = ${guildPreference.getSeekType()}. song = ${this.getDebugSongDetails()}. guess mode = ${guildPreference.getGuessModeType()}`);
        this.connection.removeAllListeners();
        this.connection.stopPlaying();
        try {
            let inputArgs = ["-ss", seekLocation.toString()];
            let encoderArgs = [];
            const specialType = guildPreference.getSpecialType();
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
            logger.info(`${getDebugLogHeader(messageContext)} | Song finished without being guessed.`);
            this.stopGuessTimeout();
            if (this.gameType === GameType.ELIMINATION) {
                const eliminationScoreboard = this.scoreboard as EliminationScoreboard;
                eliminationScoreboard.decrementAllLives();
            }
            this.endRound({ correct: false }, guildPreference, new MessageContext(this.textChannelID));
            this.startRound(await getGuildPreference(this.guildID), messageContext);
        });

        // admin manually 'disconnected' bot from voice channel or misc error
        this.connection.once("error", async (err) => {
            if (!this.connection.channelID) {
                logger.info(`${getDebugLogHeader(messageContext)} | Bot was kicked from voice channel`);
                this.stopGuessTimeout();
                await this.endSession();
                return;
            }

            logger.error(`${getDebugLogHeader(messageContext)} | Unknown error with stream dispatcher. song = ${this.getDebugSongDetails()}. err = ${err}`);
            this.errorRestartRound(guildPreference);
        });
    }

    /**
     * Attempt to restart game with different song
     * @param messageContext - The MessageContext
     * @param guildPreference - The GuildPreference
     */
    private async errorRestartRound(guildPreference: GuildPreference) {
        const messageContext = new MessageContext(this.textChannelID);
        this.endRound({ correct: false }, guildPreference);
        await sendErrorMessage(messageContext, { title: "Error playing song", description: "Starting new round in 3 seconds..." });
        this.roundsPlayed--;
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
     * @param userID - The user ID of the user guessing
     * @param guess - The user's guess
     * @param guessModeType - The guessing mode type to evaluate the guess against
     * @returns The number of points achieved for the guess
     */
    private checkGuess(userID: string, guess: string, guessModeType: GuessModeType): number {
        if (!this.gameRound) return 0;
        if (this.gameType !== GameType.ELIMINATION) {
            this.participants.add(userID);
        }
        const pointsAwarded = this.gameRound.checkGuess(guess, guessModeType);
        if (pointsAwarded) {
            this.gameRound.userCorrect(userID, pointsAwarded);
        }
        return pointsAwarded;
    }

    /**
     * Checks whether the author of the message is eligible to guess in the
     * current game session
     * @param message - The message to check for guess eligibility
     */
    private guessEligible(message: GuildTextableMessage): boolean {
        const userVoiceChannel = getUserVoiceChannel(message);
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
     * Creates song entry (if it doesn't exist) and increments play count and correct guesses
     * @param vlink - The song's YouTube ID
     * @param correct - Whether the guess was correct
     */
    private async incrementSongCount(vlink: string, correct: boolean) {
        if (!(vlink in this.playCount)) {
            this.playCount[vlink] = {
                correctGuesses: 0,
                roundsPlayed: 0,
            };
        }
        if (correct) {
            this.playCount[vlink].correctGuesses++;
        }
        this.playCount[vlink].roundsPlayed++;
    }

    /**
     * Stores song play count and correct guess count in data store
     */
    private async storeSongCounts() {
        for (const vlink of Object.keys(this.playCount)) {
            await dbContext.kmq("song_guess_count")
                .insert(
                    {
                        vlink,
                        correct_guesses: 0,
                        rounds_played: 0,
                    },
                )
                .onConflict("vlink")
                .ignore();

            await dbContext.kmq("song_guess_count")
                .where("vlink", "=", vlink)
                .increment("correct_guesses", this.playCount[vlink].correctGuesses)
                .increment("rounds_played", this.playCount[vlink].roundsPlayed);
        }
    }

    /**
     * @returns Debug string containing basic information about the GameRound
     */
    private getDebugSongDetails(): string {
        if (!this.gameRound) return "No active game round";
        return `${this.gameRound.songName}:${this.gameRound.artistName}:${this.gameRound.videoID}`;
    }

    /**
     * @param guildPreference - The guild preference
     * @param baseExp - The base amount of EXP the GameRound provides
     * @param numParticipants - The number of participants in the voice channel at the time of guess
     * @param guessSpeed - The time taken to guess correctly
     * @returns The amount of EXP gained based on the current game options
     */
    private calculateExpGain(guildPreference: GuildPreference, baseExp: number, numParticipants: number, guessSpeed: number, place: number, voteBonusExp: boolean): number {
        let expModifier = 1;
        // penalize/incentivize for number of participants from 0.75x to 1.25x
        expModifier *= numParticipants === 1 ? 0.75 : (0.0625 * (Math.min(numParticipants, 6)) + 0.875);

        // penalize for using artist guess modes
        if (guildPreference.getGuessModeType() === GuessModeType.ARTIST || guildPreference.getGuessModeType() === GuessModeType.BOTH) {
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

        // bonus for voting
        if (voteBonusExp) {
            expModifier *= 2;
        }

        return Math.floor((expModifier * baseExp) / place);
    }

    /**
     * https://www.desmos.com/calculator/zxvbuq0bch
     * @param guildPreference - The GuildPreference
     * @returns the base EXP reward for the gameround
     */
    private async calculateBaseExp(): Promise<number> {
        const songCount = this.getSongCount();
        // minimum amount of songs for exp gain
        if (songCount.count < 10) return 0;
        const expBase = 1000 / (1 + (Math.exp(1 - (0.00125 * songCount.count))));
        let expJitter = expBase * (0.05 * Math.random());
        expJitter *= Math.round(Math.random()) ? 1 : -1;

        // double exp weekend multiplier
        const multiplier = (isWeekend() || isPowerHour()) ? 2 : 1;
        return (expBase + expJitter) * multiplier;
    }

    private multiguessDelayIsActive(guildPreference: GuildPreference) {
        const playerIsAlone = getNumParticipants(this.voiceChannelID) === 1;
        return (guildPreference.getMultiGuessType() === MultiGuessType.ON) && !playerIsAlone;
    }

    private getSongCount() {
        return {
            count: this.filteredSongs.songs.size,
            countBeforeLimit: this.filteredSongs.countBeforeLimit,
        };
    }
}
