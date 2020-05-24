import Scoreboard from "./scoreboard";
import { getUserIdentifier } from "../helpers/discord_utils";
import * as Discord from "discord.js";
import { StreamDispatcher, VoiceConnection } from "discord.js"
export default class GameSession {
    private song: string;
    private artist: string;
    private videoID: string;
    private inSession: boolean;
    private skippers: Set<string>;
    public scoreboard: Scoreboard;
    public skipAchieved: boolean;
    public dispatcher: StreamDispatcher;
    public connection: VoiceConnection;
    public finished: boolean;

    constructor() {
        this.song = null;
        this.artist = null;
        this.videoID = null;
        this.inSession = false;
        this.skipAchieved = false;
        this.skippers = new Set();
        this.scoreboard = new Scoreboard();

        // dispatcher initalized in game_utils/playSong, used when changing volume
        this.dispatcher = null;
        this.connection = null;
        this.finished = false;
    }

    startRound(song: string, artist: string, link: string) {
        this.song = song;
        this.artist = artist;
        this.videoID = link;
        this.inSession = true;
        this.skipAchieved = false;
    }

    endRound() {
        this.song = null;
        this.artist = null;
        this.videoID = null;
        this.inSession = false;
        this.skippers.clear();
    }

    getSong(): string {
        return this.song;
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
