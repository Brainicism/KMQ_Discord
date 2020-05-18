import Scoreboard from "./scoreboard";
import { getUserIdentifier } from "../helpers/utils";
import {StreamDispatcher, VoiceConnection} from "discord.js"
export default class GameSession {
    private song: string;
    private artist: string;
    private videoID: string;
    private inSession: boolean;
    private skippers: Set<string>;
    public scoreboard: Scoreboard;
    public isSongCached: boolean;
    public dispatcher: StreamDispatcher;
    public connection: VoiceConnection;
    public finished: boolean;

    constructor() {
        this.song = null;
        this.artist = null;
        this.videoID = null;
        this.inSession = false;
        this.skippers = new Set();
        this.scoreboard = new Scoreboard();
        this.isSongCached = true;

        // dispatcher initalized in utils/playSong, used when changing volume
        this.dispatcher = null;
        this.connection = null;
        this.finished = false;
    }

    startRound(song, artist, link) {
        this.song = song;
        this.artist = artist;
        this.videoID = link;
        this.inSession = true;
    }

    endRound() {
        this.song = null;
        this.artist = null;
        this.videoID = null;
        this.inSession = false;
        this.skippers.clear();
        this.isSongCached = true;
    }

    getSong() {
        return this.song;
    }

    getArtist() {
        return this.artist;
    }

    getVideoID() {
        return this.videoID;
    }

    gameInSession() {
        return this.inSession;
    }

    userSkipped(user) {
        this.skippers.add(user);
    }

    getNumSkippers() {
        return this.skippers.size;
    }

    getDebugSongDetails() {
        return `${this.song}:${this.artist}:${this.videoID}`;
    }
};
