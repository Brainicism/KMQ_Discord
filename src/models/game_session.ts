import Eris from "eris";
import fs from "fs";
import path from "path";
import { CommandArgs } from "../commands/base_command";
import { SeekType } from "../commands/game_options/seek";
import { ShuffleType } from "../commands/game_options/shuffle";
import dbContext from "../database_context";
import { isDebugMode, skipSongPlay } from "../helpers/debug_utils";
import {
    getDebugContext, getSqlDateString, getUserIdentifier, getVoiceChannel, sendEndGameMessage, sendErrorMessage, sendSongMessage,
} from "../helpers/discord_utils";
import { ensureVoiceConnection, getGuildPreference, selectRandomSong } from "../helpers/game_utils";
import { delay, getAudioDurationInSeconds } from "../helpers/utils";
import state from "../kmq";
import _logger from "../logger";
import { QueriedSong } from "../types";
import GameRound from "./game_round";
import GuildPreference from "./guild_preference";
import Scoreboard from "./scoreboard";
import { deleteGameSession } from "../helpers/management_utils";

const logger = _logger("game_session");
const LAST_PLAYED_SONG_QUEUE_SIZE = 10;

export default class GameSession {
    private readonly startedAt: number;

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
    public owner: Eris.User;

    private guessTimes: Array<number>;
    private songAliasList: { [songId: string]: Array<string> };
    private guessTimeoutFunc: NodeJS.Timer;
    private lastPlayedSongsQueue: Array<string>;

    constructor(textChannel: Eris.TextChannel, voiceChannel: Eris.VoiceChannel, gameSessionCreator: Eris.User) {
        this.scoreboard = new Scoreboard();
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
        const songAliasesFilePath = path.resolve(__dirname, "../data/song_aliases.json");
        this.songAliasList = JSON.parse(fs.readFileSync(songAliasesFilePath).toString());
        this.owner = gameSessionCreator;
        this.lastPlayedSongsQueue = [];
    }

    createRound(song: string, artist: string, videoID: string) {
        this.gameRound = new GameRound(song, artist, videoID, this.songAliasList[videoID] || []);
        this.sessionInitialized = true;
        this.roundsPlayed++;
        this.lastPlayedSongsQueue.push(videoID);
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
        this.sessionInitialized = false;
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
            this.incrementPlayerGamesPlayed(participant);
        }

        for (const playerScore of this.scoreboard.getPlayerScores()) {
            this.incrementPlayerSongsGuessed(playerScore.id, playerScore.score);
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
        this.participants.add(message.author.id);
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
        const voiceChannel = getVoiceChannel(message);
        if (!this.gameRound) return;

        // if user isn't in the same voice channel
        if (!voiceChannel || !voiceChannel.voiceMembers.has(message.author.id)) {
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
            const userTag = getUserIdentifier(message.author);
            this.scoreboard.updateScoreboard(userTag, message.author.id, message.author.avatarURL, pointsEarned);
            this.stopGuessTimeout();
            sendSongMessage(message, this.scoreboard, this.gameRound, false, userTag);
            this.endRound(true);
            await dbContext.kmq("guild_preferences")
                .where("guild_id", message.guildID)
                .increment("songs_guessed", 1);
            if (!guildPreference.isGoalSet() || this.scoreboard.getWinners()[0].getScore() < guildPreference.getGoal()) {
                this.startRound(guildPreference, message);
            } else {
                logger.info(`${getDebugContext(message)} | Game session ended (goal of ${guildPreference.getGoal()} reached)`);
                await sendEndGameMessage({ channel: message.channel, authorId: message.author.id }, this);
                await this.endSession();
            }
        }
    }

    async startRound(guildPreference: GuildPreference, message: Eris.Message<Eris.GuildTextableChannel>) {
        await delay(3000);
        if (this.finished || this.gameRound) {
            return;
        }

        if (guildPreference.getShuffleType() === ShuffleType.UNIQUE && guildPreference.getLimit() === this.lastPlayedSongsQueue.length) {
            logger.info(`${getDebugContext(message)} | Resetting lastPlayedSongsQueue (all ${guildPreference.getLimit()} unique songs played)`);
            this.resetLastPlayedSongsQueue();
        } else if (guildPreference.getShuffleType() === ShuffleType.RANDOM) {
            if (this.lastPlayedSongsQueue.length >= LAST_PLAYED_SONG_QUEUE_SIZE) {
                this.lastPlayedSongsQueue = this.lastPlayedSongsQueue.slice(this.lastPlayedSongsQueue.length - LAST_PLAYED_SONG_QUEUE_SIZE - 1);
            } else if (guildPreference.getLimit() <= LAST_PLAYED_SONG_QUEUE_SIZE) {
                this.resetLastPlayedSongsQueue();
            }
        }

        this.sessionInitialized = true;
        let randomSong: QueriedSong;
        try {
            randomSong = await selectRandomSong(guildPreference, this.lastPlayedSongsQueue);
            if (randomSong === null) {
                this.sessionInitialized = false;
                sendErrorMessage(message, "Song Query Error", "Failed to find songs matching this criteria. Try to broaden your search.");
                this.endSession();
                return;
            }
        } catch (err) {
            this.sessionInitialized = false;
            await sendErrorMessage(message, "Error selecting song", "Please try starting the round again. If the issue persists, report it in our support server.");
            logger.error(`${getDebugContext(message)} | Error querying song: ${err.toString()}. guildPreference = ${JSON.stringify(guildPreference)}`);
            this.endSession();
            return;
        }
        this.createRound(randomSong.name, randomSong.artist, randomSong.youtubeLink);

        try {
            await ensureVoiceConnection(this, state.client);
        } catch (err) {
            await this.endSession();
            this.sessionInitialized = false;
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
        await this.ensurePlayerStat(userId);
        await dbContext.kmq("player_stats")
            .where("player_id", "=", userId)
            .increment("songs_guessed", score)
            .update({
                last_active: getSqlDateString(),
            });
    }

    async incrementPlayerGamesPlayed(userId: string) {
        await this.ensurePlayerStat(userId);
        await dbContext.kmq("player_stats")
            .where("player_id", "=", userId)
            .increment("games_played", 1);
    }

    resetLastPlayedSongsQueue() {
        this.lastPlayedSongsQueue = [];
    }
}
