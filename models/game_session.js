const Scoreboard = require("./scoreboard.js");
const { getUserIdentifier } = require("../helpers/utils.js");
module.exports = class GameSession {

    constructor() {
        this._song = null;
        this._artist = null;
        this._videoID = null;
        this._inSession = false;
        this._skippers = new Set();
        this.scoreboard = new Scoreboard();
        this.isSongCached = true;

        // dispatcher initalized in utils/playSong, used when changing volume
        this.dispatcher = null;
    }

    startRound(song, artist, link) {
        this._song = song;
        this._artist = artist;
        this._videoID = link;
        this._inSession = true;
    }

    endRound() {
        this._song = null;
        this._artist = null;
        this._videoID = null;
        this._inSession = false;
        this._skippers.clear();
        this.isSongCached = true;
    }

    getSong() {
        return this._song;
    }

    getArtist() {
        return this._artist;
    }

    getVideoID() {
        return this._videoID;
    }

    gameInSession() {
        return this._inSession;
    }

    userSkipped(user) {
        this._skippers.add(user);
    }

    getNumSkippers() {
        return this._skippers.size;
    }

    getDebugSongDetails() {
        return `${this._song}:${this._artist}:${this._videoID}`;
    }
};
