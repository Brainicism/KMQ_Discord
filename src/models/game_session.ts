import Scoreboard from "./scoreboard";
import { StreamDispatcher, VoiceConnection, TextChannel, Message } from "discord.js"
import _logger from "../logger";
import { Databases } from "types";
import GameRound from "./game_round";

const logger = _logger("game_session");

export default class GameSession {
    private readonly startedAt: number;

    public scoreboard: Scoreboard;
    public dispatcher: StreamDispatcher;
    public connection: VoiceConnection;
    public finished: boolean;
    public lastActive: number;
    public textChannel: TextChannel;
    public gameRound: GameRound;

    private guessTimes: Array<number>;
    private participants: Set<string>;
    private roundsPlayed: number;

    constructor(textChannel: TextChannel) {
        this.scoreboard = new Scoreboard();
        this.lastActive = Date.now();
        this.startedAt = Date.now();
        this.participants = new Set();
        this.roundsPlayed = 0;
        this.guessTimes = [];
        this.dispatcher = null;
        this.connection = null;
        this.finished = false;
        this.textChannel = textChannel;
    }

    startRound(song: string, artist: string, videoID: string) {
        this.gameRound = new GameRound(song, artist, videoID);
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
        this.gameRound.finished = true;
    }

    endSession = async (gameSessions: { [guildId: string]: GameSession }, db: Databases): Promise<void> => {
        const guildId = this.textChannel.guild.id;
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
        await db.kmq("game_sessions")
            .insert({
                start_date: new Date(this.startedAt).toISOString().slice(0, 19).replace('T', ' '),
                guild_id: this.textChannel.guild.id,
                num_participants: this.participants.size,
                avg_guess_time: averageGuessTime,
                session_length: sessionLength,
                rounds_played: this.roundsPlayed
            })

        logger.info(`gid: ${guildId} | Game session ended. rounds_played = ${this.roundsPlayed}. session_length = ${sessionLength}`);
        delete gameSessions[guildId];
    }

    gameInSession(): boolean {
        return (this.gameRound) && this.gameRound.inSession;
    }

    getDebugSongDetails(): string {
        return `${this.gameRound.song}:${this.gameRound.artist}:${this.gameRound.videoID}`;
    }

    checkGuess(message: Message): boolean {
        this.participants.add(message.author.id);
        return this.gameRound.checkGuess(message);
    }

    async lastActiveNow(db: Databases): Promise<void> {
        this.lastActive = Date.now();
        await db.kmq("guild_preferences")
            .where({ guild_id: this.textChannel.guild.id })
            .update({ last_active: new Date() });
    }
};
