const Scoreboard = require("./scoreboard.js");
const { getUserIdentifier, areUserAndBotInSameVoiceChannel } = require("../helpers/utils.js");
module.exports = class GameSession {

    constructor() {
        this._song = null;
        this._artist = null;
        this._link = null;
        this._inSession = false;
        this._skippers = new Set();
        this.scoreboard = new Scoreboard();

        // dispatcher initalized in utils/playSong
        this.dispatcher = null;
    }

    startRound(song, artist, link) {
        this._song = song;
        this._artist = artist;
        this._link = link;
        this._inSession = true;
    }

    endRound() {
        this._song = null;
        this._artist = null;
        this._link = null;
        this._inSession = false;
        this._skippers.clear();
        this.dispatcher = null;
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

    gameInSession() {
        return this._inSession;
    }

    userSkipped(user) {
        this._skippers.add(user);
    }

    getNumSkippers() {
        return this._skippers.size;
    }
};
