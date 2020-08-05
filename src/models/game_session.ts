import Scoreboard from "./scoreboard";
import * as songAliasesList from "../../data/song_aliases.json";
import { StreamDispatcher, VoiceConnection, TextChannel, DiscordAPIError, Message } from "discord.js"
import _logger from "../logger";
const logger = _logger("game_session");

import { Databases } from "types";
import { cleanSongName } from "../helpers/game_utils";
export default class GameSession {
    private song: string;
    private songAliases: Array<string>;
    private artist: string;
    private videoID: string;
    public roundActive: boolean;
    private skippers: Set<string>;
    public scoreboard: Scoreboard;
    public skipAchieved: boolean;
    public dispatcher: StreamDispatcher;
    public connection: VoiceConnection;
    public finished: boolean;
    public lastActive: number;
    public textChannel: TextChannel;

    //TODO: refactor stats collection into its own class
    private roundStartedAt: number;
    private sessionStartedAt: number;
    private guessTimes: Array<number>;
    private participants: Set<string>;
    private roundsPlayed: number;

    constructor(textChannel: TextChannel) {
        this.song = null;
        this.artist = null;
        this.videoID = null;
        this.roundActive = false;
        this.skipAchieved = false;
        this.skippers = new Set();
        this.scoreboard = new Scoreboard();
        this.lastActive = Date.now();
        this.sessionStartedAt = Date.now();
        this.participants = new Set();
        this.roundsPlayed = 0;
        this.guessTimes = [];
        // dispatcher initalized in game_utils/playSong, used when changing volume
        this.dispatcher = null;
        this.connection = null;
        this.finished = false;
        this.textChannel = textChannel;
    }

    startRound(song: string, artist: string, link: string) {
        this.song = song;
        this.songAliases = songAliasesList[link] || [];
        this.artist = artist;
        this.videoID = link;
        this.roundActive = true;
        this.skipAchieved = false;
        this.roundStartedAt = Date.now();
    }

    endRound(guessed: boolean): Promise<void> {
        return new Promise((resolve) => {
            this.song = null;
            this.artist = null;
            this.videoID = null;
            this.roundActive = false;
            this.skippers.clear();
            if (guessed) {
                this.guessTimes.push(Date.now() - this.roundStartedAt);
            }
            this.roundsPlayed++;
            if (this.dispatcher) {
                this.dispatcher.removeAllListeners();
                this.dispatcher.end();
                this.dispatcher = null;
            }
            resolve();
        })
    }

    endSession = async (gameSessions: { [guildId: string]: GameSession }, db: Databases): Promise<void> => {
        const guildId = this.textChannel.guild.id;
        const gameSession = gameSessions[guildId];
        gameSession.finished = true;
        await gameSession.endRound(false);
        if (gameSession.connection) {
            gameSession.connection.disconnect();
        }
        await db.kmq("guild_preferences")
            .where("guild_id", guildId)
            .increment("games_played", 1);

        const sessionLength = (Date.now() - this.sessionStartedAt) / (1000 * 60);
        const averageGuessTime = this.guessTimes.length > 0 ? this.guessTimes.reduce((a, b) => a + b, 0) / (this.guessTimes.length * 1000) : -1;
        await db.kmq("game_sessions")
            .insert({
                start_date: new Date(this.sessionStartedAt).toISOString().slice(0, 19).replace('T', ' '),
                guild_id: this.textChannel.guild.id,
                num_participants: this.participants.size,
                avg_guess_time: averageGuessTime,
                session_length: sessionLength,
                rounds_played: this.roundsPlayed
            })

        logger.info(`gid: ${guildId} | Game session ended. rounds_played = ${this.roundsPlayed}. session_length = ${sessionLength}`);
        delete gameSessions[guildId];
    }

    getSong(): string {
        return this.song;
    }

    getSongAliases(): string[] {
        return this.songAliases;
    }

    getArtist(): string {
        return this.artist;
    }

    getVideoID(): string {
        return this.videoID;
    }

    roundIsActive(): boolean {
        return this.roundActive;
    }

    setRoundActive(active: boolean): void {
        this.roundActive = active;
    }

    userSkipped(userId: string) {
        this.skippers.add(userId);
    }

    getNumSkippers(): number {
        return this.skippers.size;
    }

    getDebugSongDetails(): string {
        return `${this.song}:${this.artist}:${this.videoID}`;
    }

    checkGuess(message: Message): boolean {
        const guess = cleanSongName(message.content);
        this.participants.add(message.author.id);
        const cleanedSongAliases = this.songAliases.map((x) => cleanSongName(x));
        const correctGuess = this.song && (guess === cleanSongName(this.song) || cleanedSongAliases.includes(guess));
        return correctGuess;
    }

    async lastActiveNow(db: Databases): Promise<void> {
        this.lastActive = Date.now();
        await db.kmq("guild_preferences")
            .where({ guild_id: this.textChannel.guild.id })
            .update({ last_active: new Date() });
    }
};
