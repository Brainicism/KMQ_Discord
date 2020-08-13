import Scoreboard from "./scoreboard";
import { StreamDispatcher, VoiceConnection, TextChannel, Message, VoiceChannel } from "discord.js"
import _logger from "../logger";
import { db } from "../databases";
import GameRound from "./game_round";
import * as fs from "fs";
import * as _config from "../config/app_config.json";
const config: any = _config;

const logger = _logger("game_session");

export default class GameSession {
    private readonly startedAt: number;

    public sessionInitialized: boolean;
    public scoreboard: Scoreboard;
    public dispatcher: StreamDispatcher;
    public connection: VoiceConnection;
    public finished: boolean;
    public lastActive: number;
    public textChannel: TextChannel;
    public voiceChannel: VoiceChannel;
    public gameRound: GameRound;
    public roundsPlayed: number;

    private guessTimes: Array<number>;
    private participants: Set<string>;
    private songAliasList: {[songId: string]: Array<string>};


    constructor(textChannel: TextChannel, voiceChannel: VoiceChannel) {
        this.scoreboard = new Scoreboard();
        this.lastActive = Date.now();
        this.sessionInitialized = false;
        this.startedAt = Date.now();
        this.participants = new Set();
        this.roundsPlayed = 0;
        this.guessTimes = [];
        this.dispatcher = null;
        this.connection = null;
        this.finished = false;
        this.voiceChannel = voiceChannel;
        this.textChannel = textChannel;
        this.gameRound = null;
        this.songAliasList = JSON.parse(fs.readFileSync(config.songAliasesFile).toString());
    }

    startRound(song: string, artist: string, videoID: string) {
        this.gameRound = new GameRound(song, artist, videoID, this.songAliasList[videoID] || []);
        this.sessionInitialized = true;
        this.roundsPlayed++;
    }

    endRound(guessed: boolean) {
        if (guessed) {
            this.guessTimes.push(Date.now() - this.gameRound.startedAt);
        }
        if (this.dispatcher) {
            this.dispatcher.removeAllListeners();
            this.dispatcher.end();
            this.dispatcher = null;
        }
        if (this.gameRound) {
            this.gameRound.finished = true;
        }
        this.sessionInitialized = false;
    }

    setSessionInitialized(active: boolean) {
        this.sessionInitialized = active;
    }

    sessionIsInitialized(): boolean {
        return this.sessionInitialized;
    }

    endSession = async (gameSessions: { [guildId: string]: GameSession }): Promise<void> => {
        const guildId = this.textChannel.guild.id;
        if (!(guildId in gameSessions)) {
            logger.debug(`gid: ${guildId} | GameSession already ended`);
            return;
        }
        const gameSession = gameSessions[guildId];
        gameSession.finished = true;
        gameSession.endRound(false);
        if (gameSession.connection) {
            gameSession.connection.disconnect();
        }
        await db.kmq("guild_preferences")
            .where("guild_id", guildId)
            .increment("games_played", 1);

        const sessionLength = (Date.now() - this.startedAt) / (1000 * 60);
        const averageGuessTime = this.guessTimes.length > 0 ? this.guessTimes.reduce((a, b) => a + b, 0) / (this.guessTimes.length * 1000) : -1;

        logger.info(`gid: ${guildId} | Game session ended. rounds_played = ${this.roundsPlayed}. session_length = ${sessionLength}`);
        delete gameSessions[guildId];

        await db.kmq("game_sessions")
            .insert({
                start_date: new Date(this.startedAt).toISOString().slice(0, 19).replace('T', ' '),
                guild_id: this.textChannel.guild.id,
                num_participants: this.participants.size,
                avg_guess_time: averageGuessTime,
                session_length: sessionLength,
                rounds_played: this.roundsPlayed
            })

        await db.kmq("guild_preferences")
            .where("guild_id", guildId)
            .increment("games_played", 1);
    }

    getDebugSongDetails(): string {
        if (!this.gameRound) return;
        return `${this.gameRound.song}:${this.gameRound.artist}:${this.gameRound.videoID}`;
    }

    checkGuess(message: Message, modeType: string): boolean {
        if (!this.gameRound) return;
        this.participants.add(message.author.id);
        return this.gameRound.checkGuess(message, modeType);
    }

    async lastActiveNow(): Promise<void> {
        this.lastActive = Date.now();
        await db.kmq("guild_preferences")
            .where({ guild_id: this.textChannel.guild.id })
            .update({ last_active: new Date() });
    }
};
