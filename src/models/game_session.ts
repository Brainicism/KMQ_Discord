import Eris from "eris";
import fs from "fs";
import { CommandArgs } from "../commands/base_command";
import { SeekType } from "../commands/game_options/seek";
import { ShuffleType } from "../commands/game_options/shuffle";
import dbContext from "../database_context";
import { isDebugMode, skipSongPlay } from "../helpers/debug_utils";
import {
    getDebugContext, getSqlDateString, getUserIdentifier, getVoiceChannel, sendEndGameMessage, sendErrorMessage, sendSongMessage,
} from "../helpers/discord_utils";
import { ensureVoiceConnection, getGuildPreference, selectRandomSong, getSongCount } from "../helpers/game_utils";
import { delay, getAudioDurationInSeconds } from "../helpers/utils";
import state from "../kmq";
import _logger from "../logger";
import { QueriedSong } from "../types";
import GameRound from "./game_round";
import GuildPreference from "./guild_preference";
import Scoreboard from "./scoreboard";
import EliminationScoreboard from "./elimination_scoreboard";
import { deleteGameSession } from "../helpers/management_utils";

const logger = _logger("game_session");
const LAST_PLAYED_SONG_QUEUE_SIZE = 10;

export default class GameSession {
    private readonly startedAt: number;

    public readonly eliminationMode: boolean;
    public readonly owner: Eris.User;

    public roundInitialized: boolean;
    public sessionInitialized: boolean;
    public scoreboard: Scoreboard;
    public connection: Eris.VoiceConnection;
    public finished: boolean;
    public lastActive: number;
    public textChannel: Eris.TextChannel;
    public voiceChannel: Eris.VoiceChannel;
    public gameRound: GameRound;
    public roundsPlayed: number;
    public participants: Set<string>;

    private guessTimes: Array<number>;
    private songAliasList: { [songId: string]: Array<string> };
    private artistAliasList: { [artistName: string]: Array<string> };
    private guessTimeoutFunc: NodeJS.Timer;
    private lastPlayedSongsQueue: Array<string>;

    constructor(textChannel: Eris.TextChannel, voiceChannel: Eris.VoiceChannel, gameSessionCreator: Eris.User, isEliminationMode: boolean, eliminationLives: number) {
        this.eliminationMode = isEliminationMode;
        this.scoreboard = this.eliminationMode ? new EliminationScoreboard(eliminationLives) : new Scoreboard();
        this.lastActive = Date.now();
        this.roundInitialized = false;
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

    createRound(song: string, artist: string, videoID: string) {
        this.gameRound = new GameRound(song, artist, videoID);
        this.roundInitialized = true;
        this.roundsPlayed++;
    }

    endRound(guessed: boolean) {
        if (guessed) {
            this.guessTimes.push(Date.now() - this.gameRound.startedAt);
        }

        this.gameRound = null;
        if (this.connection) {
            this.connection.removeAllListeners();
        }
        this.stopGuessTimeout();
        this.roundInitialized = false;
    }

    endSession = async (): Promise<void> => {
        const guildId = this.textChannel.guild.id;
        this.finished = true;
        this.endRound(false);
        const voiceConnection = state.client.voiceConnections.get(guildId);
        if (voiceConnection && voiceConnection.channelID) {
            voiceConnection.stopPlaying();
            const voiceChannel = state.client.getChannel(voiceConnection.channelID) as Eris.VoiceChannel;
            if (voiceChannel) {
                voiceChannel.leave();
            }
        }

        for (const participant of this.participants) {
            await this.ensurePlayerStat(participant);
            await this.incrementPlayerGamesPlayed(participant);
            const playerScore = this.scoreboard.getPlayerScore(participant);
            if (playerScore > 0) {
                await this.incrementPlayerSongsGuessed(participant, playerScore);
            }
        }

        await dbContext.kmq("guild_preferences")
            .where("guild_id", guildId)
            .increment("games_played", 1);

        const sessionLength = (Date.now() - this.startedAt) / (1000 * 60);
        const averageGuessTime = this.guessTimes.length > 0 ? this.guessTimes.reduce((a, b) => a + b, 0) / (this.guessTimes.length * 1000) : -1;

        logger.info(`gid: ${guildId} | Game session ended. rounds_played = ${this.roundsPlayed}. session_length = ${sessionLength}`);
        deleteGameSession(guildId);

        await dbContext.kmq("game_sessions")
            .insert({
                start_date: getSqlDateString(this.startedAt),
                guild_id: this.textChannel.guild.id,
                num_participants: this.participants.size,
                avg_guess_time: averageGuessTime,
                session_length: sessionLength,
                rounds_played: this.roundsPlayed,
            });

        await dbContext.kmq("guild_preferences")
            .where("guild_id", guildId)
            .increment("games_played", 1);
    };

    checkGuess(message: Eris.Message, modeType: string): number {
        if (!this.gameRound) return 0;
        if (!this.eliminationMode) {
            this.participants.add(message.author.id);
        }
        return this.gameRound.checkGuess(message, modeType);
    }

    async lastActiveNow(): Promise<void> {
        this.lastActive = Date.now();
        await dbContext.kmq("guild_preferences")
            .where({ guild_id: this.textChannel.guild.id })
            .update({ last_active: new Date() });
    }

    async guessSong({ message }: CommandArgs) {
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
            logger.info(`${getDebugContext(message)} | Song correctly guessed. song = ${this.gameRound.song}`);
            const gameSession = state.gameSessions[message.guildID];
            gameSession.lastActiveNow();
            if (this.eliminationMode) {
                const eliminationScoreboard = this.scoreboard as EliminationScoreboard;
                if (!this.participants.has(message.author.id) || eliminationScoreboard.isPlayerEliminated(message.author.id)) {
                    return;
                }
            }
            const userTag = getUserIdentifier(message.author);
            this.scoreboard.updateScoreboard(userTag, message.author.id, message.author.avatarURL, pointsEarned);
            this.stopGuessTimeout();
            sendSongMessage(message, this.scoreboard, this.gameRound, false, userTag);
            this.endRound(true);
            await dbContext.kmq("guild_preferences")
                .where("guild_id", message.guildID)
                .increment("songs_guessed", 1);
            if (this.eliminationMode) {
                const eliminationScoreboard = this.scoreboard as EliminationScoreboard;
                if (eliminationScoreboard.gameFinished()) {
                    logger.info(`${getDebugContext(message)} | Game session ended (one player alive in eliminationMode)`);
                    await sendEndGameMessage({ channel: message.channel, authorId: message.author.id }, this);
                    await this.endSession();
                }
            }
            if (guildPreference.isGoalSet() && this.scoreboard.gameFinished(guildPreference.getGoal())) {
                logger.info(`${getDebugContext(message)} | Game session ended (goal of ${guildPreference.getGoal()} reached)`);
                await sendEndGameMessage({ channel: message.channel, authorId: message.author.id }, this);
                await this.endSession();
            } else {
                this.startRound(guildPreference, message);
            }
        }
    }

    async startRound(guildPreference: GuildPreference, message: Eris.Message<Eris.GuildTextableChannel>) {
        await delay(3000);
        if (this.finished || this.gameRound) {
            return;
        }
        const totalSongs = await getSongCount(guildPreference);

        if (guildPreference.getShuffleType() === ShuffleType.UNIQUE && Math.min(guildPreference.getLimit(), totalSongs) === this.lastPlayedSongsQueue.length) {
            logger.info(`${getDebugContext(message)} | Resetting lastPlayedSongsQueue (all ${guildPreference.getLimit()} unique songs played)`);
            this.resetLastPlayedSongsQueue();
        } else if (guildPreference.getShuffleType() === ShuffleType.RANDOM && this.lastPlayedSongsQueue.length === LAST_PLAYED_SONG_QUEUE_SIZE) {
            this.lastPlayedSongsQueue.shift();
        }

        this.roundInitialized = true;
        let randomSong: QueriedSong;
        try {
            randomSong = await selectRandomSong(guildPreference, this.lastPlayedSongsQueue);
            if (randomSong === null) {
                this.roundInitialized = false;
                sendErrorMessage(message, "Song Query Error", "Failed to find songs matching this criteria. Try to broaden your search.");
                this.endSession();
                return;
            }
        } catch (err) {
            this.roundInitialized = false;
            await sendErrorMessage(message, "Error selecting song", "Please try starting the round again. If the issue persists, report it in our support server.");
            logger.error(`${getDebugContext(message)} | Error querying song: ${err.toString()}. guildPreference = ${JSON.stringify(guildPreference)}`);
            this.endSession();
            return;
        }
        this.createRound(randomSong.name, randomSong.artist, randomSong.youtubeLink);
        if ((guildPreference.getLimit() > LAST_PLAYED_SONG_QUEUE_SIZE && totalSongs > LAST_PLAYED_SONG_QUEUE_SIZE)
                || guildPreference.getShuffleType() === ShuffleType.UNIQUE) {
            this.lastPlayedSongsQueue.push(randomSong.youtubeLink);
        }

        try {
            await ensureVoiceConnection(this, state.client);
        } catch (err) {
            await this.endSession();
            this.roundInitialized = false;
            logger.error(`${getDebugContext(message)} | Error obtaining voice connection. err = ${err.toString()}`);
            await sendErrorMessage(message, "Missing voice permissions", "The bot is unable to join the voice channel you are in.");
            return;
        }
        this.playSong(guildPreference, message);
    }

    async playSong(guildPreference: GuildPreference, message: Eris.Message<Eris.GuildTextableChannel>) {
        const { gameRound } = this;
        if (isDebugMode() && skipSongPlay()) {
            logger.debug(`${getDebugContext(message)} | Not playing song in voice connection. song = ${this.getDebugSongDetails()}`);
            return;
        }
        const songLocation = `${process.env.SONG_DOWNLOAD_DIR}/${gameRound.videoID}.ogg`;

        let seekLocation: number;
        if (guildPreference.getSeekType() === SeekType.RANDOM) {
            try {
                const songDuration = await getAudioDurationInSeconds(songLocation);
                seekLocation = songDuration * (0.6 * Math.random());
            } catch (e) {
                logger.error(`Failed to get song length: ${songLocation}. err = ${e}`);
                seekLocation = 0;
            }
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
        this.connection.once("end", async () => {
            logger.info(`${getDebugContext(message)} | Song finished without being guessed.`);
            this.stopGuessTimeout();
            sendSongMessage(message, this.scoreboard, this.gameRound, true);
            this.endRound(false);
            this.startRound(guildPreference, message);
        });

        this.connection.once("error", async (err) => {
            if (!this.connection.channelID) {
                logger.info(`gid: ${this.textChannel.guild.id} | Bot was kicked from voice channel`);
                this.stopGuessTimeout();
                await sendEndGameMessage({ channel: message.channel }, this);
                await this.endSession();
                return;
            }

            logger.error(`${getDebugContext(message)} | Unknown error with stream dispatcher. song = ${this.getDebugSongDetails()}. err = ${err}`);
            // Attempt to restart game with different song
            await sendErrorMessage(message, "Error playing song", "Starting new round in 3 seconds...");
            this.endRound(false);
            this.startRound(guildPreference, message);
        });
    }

    getDebugSongDetails(): string {
        if (!this.gameRound) return "No active game round";
        return `${this.gameRound.song}:${this.gameRound.artist}:${this.gameRound.videoID}`;
    }

    async startGuessTimeout(message: Eris.Message<Eris.GuildTextableChannel>) {
        const guildPreference = await getGuildPreference(message.guildID);
        if (!guildPreference.isGuessTimeoutSet()) return;
        const time = guildPreference.getGuessTimeout();
        this.guessTimeoutFunc = setTimeout(async () => {
            if (this.finished) return;
            logger.info(`${getDebugContext(message)} | Song finished without being guessed, timer of: ${time} seconds.`);
            if (this.eliminationMode) {
                const eliminationScoreboard = this.scoreboard as EliminationScoreboard;
                eliminationScoreboard.decrementAllLives();
                if (eliminationScoreboard.gameFinished()) {
                    sendSongMessage(message, this.scoreboard, this.gameRound, true);
                    await sendEndGameMessage({ channel: message.channel, authorId: message.author.id }, this);
                    this.endRound(false);
                    this.endSession();
                    return;
                }
            }
            sendSongMessage(message, this.scoreboard, this.gameRound, true);
            this.endRound(false);
            this.startRound(guildPreference, message);
        }, time * 1000);
    }

    stopGuessTimeout() {
        clearTimeout(this.guessTimeoutFunc);
    }

    async ensurePlayerStat(userId: string) {
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

    async incrementPlayerSongsGuessed(userId: string, score: number) {
        await dbContext.kmq("player_stats")
            .where("player_id", "=", userId)
            .increment("songs_guessed", score)
            .update({
                last_active: getSqlDateString(),
            });
    }

    async incrementPlayerGamesPlayed(userId: string) {
        await dbContext.kmq("player_stats")
            .where("player_id", "=", userId)
            .increment("games_played", 1);
    }

    resetLastPlayedSongsQueue() {
        this.lastPlayedSongsQueue = [];
    }

    addParticipant(user: Eris.User) {
        this.participants.add(user.id);
        if (this.eliminationMode) {
            const eliminationScoreboard = this.scoreboard as EliminationScoreboard;
            eliminationScoreboard.addPlayer(user.id, getUserIdentifier(user), user.avatarURL);
            this.scoreboard = eliminationScoreboard;
        }
    }
}
