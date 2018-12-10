const Scoreboard = require("./scoreboard.js");
const BEGINNING_SEARCH_YEAR = 2008;
const MALE = "male";
const FEMALE = "female";
const COED = "coed";
const DEFAULT_OPTIONS = { beginningYear: BEGINNING_SEARCH_YEAR, gender: [ FEMALE ] }

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

    resetGender() {
        this._gameOptions.gender = [ FEMALE ];
    }

    setGender(genderArr) {
        // Return true when gender is successfully updated, false otherwise
        if (genderArr.length === 0) {
            this.resetGender();
        }
        else {
            genderArr.map((gender, i) => { genderArr[i] = genderArr[i].toLowerCase(); })
            this._gameOptions.gender = [];
            for (let i = 0; i < genderArr.length; i++) {
                if (!this._gameOptions.gender.includes(genderArr[i]) &&
                    ((genderArr[i] === MALE) ||
                     (genderArr[i] === FEMALE) ||
                     (genderArr[i] === COED))) {
                    this._gameOptions.gender.push(genderArr[i]);
                }
            }
            if (this._gameOptions.gender.length === 0) {
                // User gave invalid inputs only
                this.resetGender();
                return false;
            }
        }
        return true;
    }

    getSQLGender() {
        let genderStr = "";
        this._gameOptions.gender.map((gender, i) => {
            genderStr += `"${gender}"`;
            if (this._gameOptions.gender.length !== i + 1) {
                genderStr += " OR ";
            }
        })
        return genderStr;
    }

    getGenderArray() {
        return this._gameOptions.gender;
    }
};
