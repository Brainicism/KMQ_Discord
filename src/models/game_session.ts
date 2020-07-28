import Scoreboard from "./scoreboard";
import * as songAliasesList from "../../data/song_aliases.json";
import { StreamDispatcher, VoiceConnection, TextChannel } from "discord.js"
export default class GameSession {
    private song: string;
    private songAliases: Array<string>;
    private artist: string;
    private videoID: string;
    private inSession: boolean;
    private skippers: Set<string>;
    public scoreboard: Scoreboard;
    public skipAchieved: boolean;
    public dispatcher: StreamDispatcher;
    public connection: VoiceConnection;
    public finished: boolean;
    public lastActive: number;
    public textChannel: TextChannel;

    constructor(textChannel: TextChannel) {
        this.song = null;
        this.artist = null;
        this.videoID = null;
        this.inSession = false;
        this.skipAchieved = false;
        this.skippers = new Set();
        this.scoreboard = new Scoreboard();
        this.lastActive = Date.now();

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
        this.inSession = true;
        this.skipAchieved = false;
        this.lastActive = Date.now();
    }

    endRound(): Promise<void> {
        return new Promise((resolve) => {
            this.song = null;
            this.artist = null;
            this.videoID = null;
            this.inSession = false;
            this.skippers.clear();
            this.lastActive = Date.now();
            if (this.dispatcher) {
                this.dispatcher.removeAllListeners();
                this.dispatcher.end();
                this.dispatcher = null;
            }
            resolve();
        })
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

    gameInSession(): boolean {
        return this.inSession;
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
};
