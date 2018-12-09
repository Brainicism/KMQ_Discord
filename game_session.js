const Scoreboard = require("./scoreboard.js");
const BEGINNING_SEARCH_YEAR = 2008;
const DEFAULT_OPTIONS = { beginningYear: BEGINNING_SEARCH_YEAR }

module.exports = class GameSession {

    constructor() {
        this._song = null;
        this._artist = null;
        this._link = null;
        this._inSession = false;
        this._gameOptions = DEFAULT_OPTIONS;
        this.scoreboard = new Scoreboard();
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

    gameInSession() {
        return this._inSession;
    }

    setBeginningCutoffYear(year) {
        this._gameOptions.beginningYear = year;
    }

    resetBeginningCutoffYear() {
        this._gameOptions.beginningYear = BEGINNING_SEARCH_YEAR;
    }

    getBeginningCutoffYear() {
        return this._gameOptions.beginningYear;
    }

    getDefaultBeginningCutoffYear() {
        return BEGINNING_SEARCH_YEAR;
    }
};
