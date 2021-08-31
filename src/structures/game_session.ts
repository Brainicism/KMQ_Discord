import Eris from "eris";
import fs from "fs";
import _ from "lodash";
import * as uuid from "uuid";
import { SeekType } from "../commands/game_options/seek";
import { ShuffleType } from "../commands/game_options/shuffle";
import dbContext from "../database_context";
import { isDebugMode, skipSongPlay } from "../helpers/debug_utils";
import {
    getDebugLogHeader, getSqlDateString, sendErrorMessage, sendEndRoundMessage, sendInfoMessage, getNumParticipants, getUserVoiceChannel, sendEndGameMessage, getCurrentVoiceMembers,
    sendBookmarkedSongs, tryInteractionAcknowledge, tryCreateInteractionSuccessAcknowledgement, tryCreateInteractionErrorAcknowledgement,
} from "../helpers/discord_utils";
import { ensureVoiceConnection, getGuildPreference, selectRandomSong, getFilteredSongList, userBonusIsActive, getMultipleChoiceOptions, isUserPremium } from "../helpers/game_utils";
import { delay, getOrdinalNum, isPowerHour, isWeekend, setDifference, bold, codeLine, chunkArray, chooseRandom } from "../helpers/utils";
import { state } from "../kmq";
import { IPCLogger } from "../logger";
import { QueriedSong, PlayerRoundResult, GameType } from "../types";
import GameRound from "./game_round";
import GuildPreference from "./guild_preference";
import Scoreboard, { SuccessfulGuessResult } from "./scoreboard";
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
import { specialFfmpegArgs, resetSpecial } from "../commands/game_options/special";
import { AnswerType } from "../commands/game_options/answer";

const MULTIGUESS_DELAY = 1500;
const logger = new IPCLogger("game_session");
const LAST_PLAYED_SONG_QUEUE_SIZE = 10;

const EXP_TABLE = [...Array(1000).keys()].map((level) => {
    if (level === 0 || level === 1) return 0;
    return 10 * (level ** 2) + 200 * level - 200;
});

// eslint-disable-next-line no-return-assign
export const CUM_EXP_TABLE = EXP_TABLE.map(((sum) => (value) => sum += value)(0));
export const BOOKMARK_MESSAGE_SIZE = 10;

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

    /** The Scoreboard object keeping track of players and scoring */
    public readonly scoreboard: Scoreboard;

    /** The ID of text channel in which the GameSession was started in, and will be active in */
    public readonly textChannelID: string;

    /** The ID of the voice channel in which the GameSession was started in, and will be active in */
    public readonly voiceChannelID: string;

    /** The Discord Guild ID */
    public readonly guildID: string;

    /** Initially the user who started the GameSession, transferred to current VC member */
    public owner: KmqMember;

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

    /** Array of previous songs by messageID for bookmarking songs */
    private songMessageIDs: { messageID: string, song: QueriedSong }[];

    /** Mapping of user ID to bookmarked songs, uses Map since Set doesn't remove QueriedSong duplicates */
    private bookmarkedSongs: { [userID: string]: Map<string, QueriedSong> };

    /** Whether the current game is premium */
    private premiumGame: boolean;

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
        this.songMessageIDs = [];
        this.bookmarkedSongs = {};
        this.premiumGame = false;
    }

    /**
     * Ends an active GameRound
     * @param guessResult - Whether the round ended via a correct guess (includes exp gain), or other (timeout, error, etc)
     * @param guildPreference - The GuildPreference
     * @param messageContext - An object containing relevant parts of Eris.Message
     */
    async endRound(guessResult: GuessResult, guildPreference: GuildPreference, messageContext?: MessageContext) {
        if (this.connection) {
            this.connection.removeAllListeners();
        }

        if (this.gameRound === null) {
            return;
        }

        const gameRound = this.gameRound;
        this.gameRound = null;

        gameRound.interactionMarkAnswers(guessResult.correctGuessers?.length);

        let playerRoundResults: Array<PlayerRoundResult> = [];
        if (guessResult.correct) {
            // update guessing streaks
            if (this.lastGuesser === null || this.lastGuesser.userID !== guessResult.correctGuessers[0].id) {
                this.lastGuesser = { userID: guessResult.correctGuessers[0].id, streak: 1 };
            } else {
                this.lastGuesser.streak++;
            }

            const guessSpeed = Date.now() - gameRound.startedAt;
            this.guessTimes.push(guessSpeed);

            // update scoreboard
            playerRoundResults = await Promise.all(guessResult.correctGuessers.map(async (correctGuesser, idx) => {
                const guessPosition = idx + 1;
                const expGain = this.calculateExpGain(guildPreference,
                    gameRound.getExpReward(),
                    getNumParticipants(this.voiceChannelID),
                    guessSpeed,
                    guessPosition,
                    await userBonusIsActive(correctGuesser.id));

                let streak = 0;
                if (idx === 0) {
                    streak = this.lastGuesser.streak;
                    logger.info(`${getDebugLogHeader(messageContext)}, uid: ${correctGuesser.id} | Song correctly guessed. song = ${gameRound.songName}. Multiple choice = ${guildPreference.isMultipleChoiceMode()}. Gained ${expGain} EXP`);
                } else {
                    streak = 0;
                    logger.info(`${getDebugLogHeader(messageContext)}, uid: ${correctGuesser.id} | Song correctly guessed ${getOrdinalNum(guessPosition)}. song = ${gameRound.songName}. Multiple choice = ${guildPreference.isMultipleChoiceMode()}. Gained ${expGain} EXP`);
                }

                return {
                    player: correctGuesser, pointsEarned: idx === 0 ? correctGuesser.pointsAwarded : correctGuesser.pointsAwarded / 2, expGain, streak,
                };
            }));

            const scoreboardUpdatePayload: SuccessfulGuessResult[] = playerRoundResults.map((x) => ({ userID: x.player.id, expGain: x.expGain, pointsEarned: x.pointsEarned }));
            this.scoreboard.updateScoreboard(scoreboardUpdatePayload);
        } else {
            this.lastGuesser = null;
            if (this.gameType === GameType.ELIMINATION) {
                const eliminationScoreboard = this.scoreboard as EliminationScoreboard;
                eliminationScoreboard.decrementAllLives();
            }
        }

        // calculate remaining game duration if applicable
        const currGameLength = (Date.now() - this.startedAt) / 60000;
        const remainingDuration = guildPreference.isDurationSet() ? (guildPreference.gameOptions.duration - currGameLength) : null;

        if (messageContext) {
            let uniqueSongCounter: UniqueSongCounter;
            if (guildPreference.isShuffleUnique()) {
                const filteredSongs = new Set([...this.filteredSongs.songs].map((x) => x.youtubeLink));
                uniqueSongCounter = {
                    uniqueSongsPlayed: this.uniqueSongsPlayed.size - setDifference([...this.uniqueSongsPlayed], [...filteredSongs]).size,
                    totalSongs: Math.min(this.filteredSongs.countBeforeLimit, guildPreference.gameOptions.limitEnd - guildPreference.gameOptions.limitStart),
                };
            }

            const { id } = await sendEndRoundMessage(messageContext, this.scoreboard, gameRound, guildPreference.gameOptions.guessModeType,
                playerRoundResults, guildPreference.isMultipleChoiceMode(), remainingDuration, uniqueSongCounter);

            if (Object.keys(this.songMessageIDs).length === BOOKMARK_MESSAGE_SIZE) {
                this.songMessageIDs.shift();
            }

            this.songMessageIDs.push({
                messageID: id,
                song: {
                    songName: gameRound.songName,
                    originalSongName: gameRound.originalSongName,
                    artist: gameRound.artistName,
                    youtubeLink: gameRound.videoID,
                    publishDate: new Date(gameRound.songYear, 0),
                },
            });
        }

        this.incrementSongCount(gameRound.videoID, guessResult.correct);

        // cleanup
        this.stopGuessTimeout();

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
        await this.endRound({ correct: false }, await getGuildPreference(this.guildID));
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
            const levelUpMessages = leveledUpPlayers
                .sort((a, b) => b.endLevel - a.endLevel)
                .sort((a, b) => (b.endLevel - b.startLevel) - (a.endLevel - a.startLevel))
                .map((leveledUpPlayer) => `${bold(this.scoreboard.getPlayerName(leveledUpPlayer.userID))} has leveled from ${codeLine(String(leveledUpPlayer.startLevel))} to ${codeLine(String(leveledUpPlayer.endLevel))} (${codeLine(getRankNameByLevel(leveledUpPlayer.endLevel))})`)
                .slice(0, 10);

            if (leveledUpPlayers.length > 10) {
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
        const guildPreference = await getGuildPreference(this.guildID);
        if (!guildPreference.isMultipleChoiceMode()) {
            await this.storeSongCounts();
        }

        // DM bookmarked songs
        const bookmarkedSongsPlayerCount = Object.keys(this.bookmarkedSongs).length;
        if (bookmarkedSongsPlayerCount > 0) {
            const bookmarkedSongCount = Object.values(this.bookmarkedSongs).reduce((total, x) => total + x.size, 0);
            await sendInfoMessage(new MessageContext(this.textChannelID), {
                title: "Sending bookmarked songs...",
                description: `Sending ${bookmarkedSongCount} song(s) to ${bookmarkedSongsPlayerCount} player(s).\n\nBookmark songs during the game by right-clicking the song message and selecting \`Apps > Bookmark Song\`.`,
                thumbnailUrl: KmqImages.READING_BOOK,
            });
            await sendBookmarkedSongs(this.bookmarkedSongs);

            // Store bookmarked songs
            await dbContext.kmq.transaction(async (trx) => {
                const idLinkPairs: { user_id: string, vlink: string }[] = [];
                for (const entry of Object.entries(this.bookmarkedSongs)) {
                    for (const song of entry[1]) {
                        idLinkPairs.push({ user_id: entry[0], vlink: song[0] });
                    }
                }

                await dbContext.kmq("bookmarked_songs")
                    .insert(idLinkPairs)
                    .onConflict(["user_id", "vlink"])
                    .ignore()
                    .transacting(trx);
            });
        }

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
     * @param messageContext - The context of the message to check
     * @param guess - the content of the message to check
     */
    async guessSong(messageContext: MessageContext, guess: string) {
        if (!this.connection) return;
        if (this.connection.listenerCount("end") === 0) return;
        if (!this.gameRound) return;
        if (!this.guessEligible(messageContext)) return;

        const guildPreference = await getGuildPreference(messageContext.guildID);
        const pointsEarned = this.checkGuess(messageContext.author.id, guess, guildPreference.gameOptions.guessModeType, guildPreference.isMultipleChoiceMode());
        if (pointsEarned > 0) {
            if (this.gameRound.finished) {
                return;
            }

            this.gameRound.finished = true;
            await delay(this.multiguessDelayIsActive(guildPreference) ? MULTIGUESS_DELAY : 0);
            if (!this.gameRound) return;

            // mark round as complete, so no more guesses can go through
            await this.endRound({ correct: true, correctGuessers: this.gameRound.correctGuessers }, guildPreference, messageContext);
            this.correctGuesses++;

            // update game session's lastActive
            this.lastActiveNow();

            this.stopGuessTimeout();

            // increment guild's song guess count
            await dbContext.kmq("guild_preferences")
                .where("guild_id", this.guildID)
                .increment("songs_guessed", 1);

            this.startRound(guildPreference, messageContext);
        } else if (guildPreference.isMultipleChoiceMode()) {
            if (setDifference([...new Set(getCurrentVoiceMembers(this.voiceChannelID).map((x) => x.id))], [...this.gameRound.incorrectMCGuessers]).size === 0) {
                await this.endRound({ correct: false }, guildPreference, new MessageContext(this.textChannelID));
                this.startRound(await getGuildPreference(this.guildID), messageContext);
            }
        }
    }

    /**
     * Starting a new GameRound
     * @param guildPreference - The guild's GuildPreference
     * @param messageContext - An object containing relevant parts of Eris.Message
     */
    async startRound(guildPreference: GuildPreference, messageContext: MessageContext) {
        if (!this.sessionInitialized) {
            await this.updatePremiumStatus(await isUserPremium(this.owner.id));
        }

        this.sessionInitialized = true;
        await delay(this.multiguessDelayIsActive(guildPreference) ? 3000 - MULTIGUESS_DELAY : 3000);
        if (this.finished || this.gameRound) {
            return;
        }

        if (this.filteredSongs === null) {
            try {
                await this.updateFilteredSongs(guildPreference);
            } catch (err) {
                await sendErrorMessage(messageContext, { title: "Error selecting song", description: "Please try starting the round again. If the issue persists, report it in our official KMQ server." });
                logger.error(`${getDebugLogHeader(messageContext)} | Error querying song: ${err.toString()}. guildPreference = ${JSON.stringify(guildPreference)}`);
                await this.endSession();
                return;
            }
        }

        const totalSongsCount = this.filteredSongs.songs.size;

        // manage unique songs
        if (guildPreference.gameOptions.shuffleType === ShuffleType.UNIQUE) {
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
        const ignoredSongs = new Set([...this.lastPlayedSongs, ...this.uniqueSongsPlayed]);
        const randomSong = await selectRandomSong(this.filteredSongs.songs, ignoredSongs, this.lastAlternatingGender);

        if (randomSong === null) {
            sendErrorMessage(messageContext, { title: "Song Query Error", description: "Failed to find songs matching this criteria. Try to broaden your search." });
            await this.endSession();
            return;
        }

        if (totalSongsCount > LAST_PLAYED_SONG_QUEUE_SIZE) {
            this.lastPlayedSongs.push(randomSong.youtubeLink);
        }

        if (guildPreference.gameOptions.shuffleType === ShuffleType.UNIQUE) {
            this.uniqueSongsPlayed.add(randomSong.youtubeLink);
        }

        // create a new round with randomly chosen song
        this.prepareRound(randomSong.songName, randomSong.originalSongName, randomSong.artist, randomSong.youtubeLink, randomSong.publishDate.getFullYear());
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

        if (guildPreference.isMultipleChoiceMode()) {
            const correctChoice = guildPreference.gameOptions.guessModeType === GuessModeType.ARTIST ? this.gameRound.artistName : this.gameRound.songName;
            const wrongChoices = await getMultipleChoiceOptions(guildPreference.gameOptions.answerType,
                guildPreference.gameOptions.guessModeType,
                randomSong.members,
                correctChoice,
                randomSong.artistID);

            let buttons: Array<Eris.InteractionButton> = [];
            for (const choice of wrongChoices) {
                const id = uuid.v4();
                this.gameRound.interactionIncorrectAnswerUUIDs[id] = 0;
                buttons.push({ type: 2, style: 1, label: choice, custom_id: id });
            }

            this.gameRound.interactionCorrectAnswerUUID = uuid.v4();
            buttons.push({ type: 2, style: 1, label: correctChoice, custom_id: this.gameRound.interactionCorrectAnswerUUID });

            buttons = _.shuffle(buttons);

            let components: Array<Eris.ActionRow>;
            switch (guildPreference.gameOptions.answerType) {
                case AnswerType.MULTIPLE_CHOICE_EASY:
                    components = [
                        {
                            type: 1,
                            components: buttons,
                        },
                    ];
                    break;
                case AnswerType.MULTIPLE_CHOICE_MED:
                    components = chunkArray(buttons, 3).map((x) => ({ type: 1, components: x }));
                    break;
                case AnswerType.MULTIPLE_CHOICE_HARD:
                    components = chunkArray(buttons, 4).map((x) => ({ type: 1, components: x }));
                    break;
                default:
                    break;
            }

            this.gameRound.interactionComponents = components;

            this.gameRound.interactionMessage = await sendInfoMessage(new MessageContext(this.textChannelID), {
                title: `Guess the ${guildPreference.gameOptions.guessModeType === GuessModeType.BOTH ? "song" : guildPreference.gameOptions.guessModeType}!`,
                components,
                thumbnailUrl: KmqImages.LISTENING,
            });
        }
    }

    /**
     * Sets a timeout for guessing in timer mode
     * @param messageContext - An object containing relevant parts of Eris.Message
     * @param guildPreference - The GuildPreference
     */
    startGuessTimeout(messageContext: MessageContext, guildPreference: GuildPreference) {
        if (!guildPreference.isGuessTimeoutSet()) return;

        const time = guildPreference.gameOptions.guessTimeout;
        this.guessTimeoutFunc = setTimeout(async () => {
            if (this.finished || this.gameRound.finished) return;
            logger.info(`${getDebugLogHeader(messageContext)} | Song finished without being guessed, timer of: ${time} seconds.`);
            await this.endRound({ correct: false }, guildPreference, new MessageContext(this.textChannelID));
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
        this.filteredSongs = await getFilteredSongList(guildPreference, this.isPremiumGame());
    }

    /**
     * Finds the song associated with the endRoundMessage via messageID, if it exists
     * @param messageID - The Discord message ID used to locate the song
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
    addBookmarkedSong(userID: string, song: QueriedSong) {
        if (!userID || !song) {
            return;
        }

        if (!this.bookmarkedSongs[userID]) {
            this.bookmarkedSongs[userID] = new Map();
        }

        this.bookmarkedSongs[userID].set(song.youtubeLink, song);
    }

    /** Updates owner to the first player to join the game that didn't leave VC */
    updateOwner() {
        const voiceMembers = getCurrentVoiceMembers(this.voiceChannelID);
        const voiceMemberIDs = new Set(voiceMembers.map((x) => x.id));
        if (voiceMemberIDs.has(this.owner.id) || voiceMemberIDs.size === 0) {
            return;
        }

        const participantsInVC = [...this.participants].filter((p) => voiceMemberIDs.has(p));
        let newOwnerID: string;
        if (participantsInVC.length > 0) {
            // Pick the first participant still in VC
            newOwnerID = participantsInVC[0];
        } else {
            // The VC only contains members who haven't participated yet
            newOwnerID = chooseRandom(voiceMembers).id;
        }

        this.owner = KmqMember.fromUser(voiceMembers.find((x) => x.id === newOwnerID));
        sendInfoMessage(new MessageContext(this.textChannelID), { title: "Game owner changed", description: `The new game owner is ${bold(this.owner.tag)}. They are in charge of \`,forcehint\` and \`,forceskip\`.`, thumbnailUrl: KmqImages.LISTENING });
    }

    async handleMultipleChoiceInteraction(interaction: Eris.ComponentInteraction, messageContext: MessageContext) {
        if (!getCurrentVoiceMembers(this.voiceChannelID).map((x) => x.id).includes(interaction.member.id)) {
            tryInteractionAcknowledge(interaction);
            return;
        }

        if (this.gameRound.incorrectMCGuessers.has(interaction.member.id)) {
            tryCreateInteractionErrorAcknowledgement(interaction, "You've already been eliminated this round.");
            return;
        }

        if (!this.gameRound.isValidInteractionGuess(interaction.data.custom_id)) {
            tryCreateInteractionErrorAcknowledgement(interaction, "You are attempting to pick an option from an already completed round.");
            return;
        }

        if (!this.gameRound.isCorrectInteractionAnswer(interaction.data.custom_id)) {
            tryCreateInteractionErrorAcknowledgement(interaction, "You've been eliminated this round.");

            if (!this.gameRound) {
                return;
            }

            this.gameRound.incorrectMCGuessers.add(interaction.member.id);
            this.gameRound.interactionIncorrectAnswerUUIDs[interaction.data.custom_id]++;

            // Add the user as a participant
            this.guessSong(messageContext, "");
            return;
        }

        tryInteractionAcknowledge(interaction);

        const guildPreference = await getGuildPreference(messageContext.guildID);
        if (!this.gameRound) return;
        this.guessSong(messageContext, guildPreference.gameOptions.guessModeType !== GuessModeType.ARTIST ? this.gameRound.songName : this.gameRound.artistName);
    }

    async handleBookmarkInteraction(interaction: Eris.CommandInteraction) {
        const song = this.getSongFromMessageID(interaction.data.target_id);
        if (!song) {
            tryCreateInteractionErrorAcknowledgement(interaction, `You can only bookmark songs recently played in the last ${BOOKMARK_MESSAGE_SIZE} rounds. You must bookmark the message sent by the bot containing the song.`);
            return;
        }

        tryCreateInteractionSuccessAcknowledgement(interaction, "Song Bookmarked", `You'll receive a direct message with a link to ${bold(song.originalSongName)} at the end of the game.`);
        this.addBookmarkedSong(interaction.member?.id, song);
    }

    /**
    * If the game changes its premium state, update filtered songs
    * @param premiumJoined - true if a premium member joined VC
    */
    async updatePremiumStatus(premiumJoined: boolean) {
        if (premiumJoined) {
            this.premiumGame = true;
            return;
        }

        const premiumBefore = this.premiumGame;
        const voiceMembers = getCurrentVoiceMembers(this.voiceChannelID);
        for (const member of voiceMembers) {
            if (await isUserPremium(member.id)) {
                this.premiumGame = true;
                if (this.premiumGame !== premiumBefore) {
                    const guildPreference = await getGuildPreference(this.guildID);
                    await this.updateFilteredSongs(guildPreference);
                }

                return;
            }
        }

        this.premiumGame = false;
        if (this.premiumGame !== premiumBefore) {
            const guildPreference = await getGuildPreference(this.guildID);
            await this.updateFilteredSongs(guildPreference);
        }

        if (this.guildID !== process.env.DEBUG_SERVER_ID) {
            const guildPreference = await getGuildPreference(this.guildID);
            const messageContext = new MessageContext(this.textChannelID);
            await resetSpecial(guildPreference, messageContext, true);
        }
    }

    /** Whether the current game has premium features */
    isPremiumGame(): boolean {
        return this.premiumGame;
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
        const seekType = guildPreference.gameOptions.seekType;
        if (seekType === SeekType.BEGINNING) {
            seekLocation = 0;
        } else {
            const songDuration = (await dbContext.kmq("cached_song_duration")
                .select(["duration"])
                .where("vlink", "=", gameRound.videoID)
                .first()).duration;

            if (seekType === SeekType.RANDOM) {
                seekLocation = songDuration * (0.6 * Math.random());
            } else if (seekType === SeekType.MIDDLE) {
                seekLocation = songDuration * (0.4 + 0.2 * Math.random());
            }
        }

        const stream = fs.createReadStream(songLocation);

        logger.info(`${getDebugLogHeader(messageContext)} | Playing song in voice connection. seek = ${seekType}. song = ${this.getDebugSongDetails()}. guess mode = ${guildPreference.gameOptions.guessModeType}`);
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
            logger.info(`${getDebugLogHeader(messageContext)} | Song finished without being guessed.`);
            this.stopGuessTimeout();

            await this.endRound({ correct: false }, guildPreference, new MessageContext(this.textChannelID));
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
        await this.endRound({ correct: false }, guildPreference);
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
    private prepareRound(cleanSongName: string, originalSongName: string, artist: string, videoID: string, year: number) {
        this.gameRound = new GameRound(cleanSongName, originalSongName, artist, videoID, year);
    }

    /**
     *
     * @param userID - The user ID of the user guessing
     * @param guess - The user's guess
     * @param guessModeType - The guessing mode type to evaluate the guess against
     * @param multipleChoiceMode - Whether the answer type is set to multiple choice
     * @returns The number of points achieved for the guess
     */
    private checkGuess(userID: string, guess: string, guessModeType: GuessModeType, multipleChoiceMode: boolean): number {
        if (!this.gameRound) return 0;
        if (multipleChoiceMode && this.gameRound.incorrectMCGuessers.has(userID)) return 0;
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
     * @param messageContext - The context of the message to check for guess eligibility
     */
    private guessEligible(messageContext: MessageContext): boolean {
        const userVoiceChannel = getUserVoiceChannel(messageContext);
        // if user isn't in the same voice channel
        if (!userVoiceChannel || (userVoiceChannel.id !== this.voiceChannelID)) {
            return false;
        }

        // if message isn't in the active game session's text channel
        if (messageContext.textChannelID !== this.textChannelID) {
            return false;
        }

        // check elimination mode constraints
        if (this.gameType === GameType.ELIMINATION) {
            const eliminationScoreboard = this.scoreboard as EliminationScoreboard;
            if (!this.participants.has(messageContext.author.id) || eliminationScoreboard.isPlayerEliminated(messageContext.author.id)) {
                return false;
            }
        } else if (this.gameType === GameType.TEAMS) {
            const teamScoreboard = this.scoreboard as TeamScoreboard;
            if (!teamScoreboard.getPlayer(messageContext.author.id)) {
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
        if (guildPreference.gameOptions.guessModeType === GuessModeType.ARTIST || guildPreference.gameOptions.guessModeType === GuessModeType.BOTH) {
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

        if (guildPreference.isMultipleChoiceMode()) {
            const difficulty = guildPreference.gameOptions.answerType;
            switch (difficulty) {
                case AnswerType.MULTIPLE_CHOICE_EASY:
                    expModifier *= 0.25;
                    break;
                case AnswerType.MULTIPLE_CHOICE_MED:
                    expModifier *= 0.5;
                    break;
                case AnswerType.MULTIPLE_CHOICE_HARD:
                    expModifier *= 0.75;
                    break;
                default:
                    break;
            }
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
        return (guildPreference.gameOptions.multiGuessType === MultiGuessType.ON) && !playerIsAlone;
    }

    private getSongCount() {
        return {
            count: this.filteredSongs.songs.size,
            countBeforeLimit: this.filteredSongs.countBeforeLimit,
        };
    }
}
