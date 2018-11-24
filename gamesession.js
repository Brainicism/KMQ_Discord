const Scoreboard = require("./scoreboard.js");

module.exports = class GameSession {
    constructor() {
        this._song = null;
        this._artist = null;
        this._link = null;
        this._inSession = false;
        this.scoreboard = new Scoreboard();
    }

    startRound(song, artist, link) {
        this._song = song;
        this._artist = artist;
        this._link = link;
        this.inSession = true;
    }

    endRound() {
        this._song = null;
        this._artist = null;
        this._link = null;
        this.inSession = false;
    }

    endGame() {
        this.endRound();
        this.scoreboard = new Scoreboard();
    }

    getSong() {
        return this._song;
    }

    getArtist() {
        return this._artist;
    }

    getLink() {
        return this._link;
    }

    inSession() {
        return this._inSession;
    }
};
