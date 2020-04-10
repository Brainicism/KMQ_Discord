const BEGINNING_SEARCH_YEAR = require("../commands/cutoff").BEGINNING_SEARCH_YEAR;
const DEFAULT_BOT_PREFIX = "!";
const DEFAULT_LIMIT = require("../commands/limit").DEFAULT_LIMIT;
const GENDER = require("../commands/gender").GENDER;
const DEFAULT_OPTIONS = { beginningYear: BEGINNING_SEARCH_YEAR, gender: [GENDER.FEMALE], limit: DEFAULT_LIMIT };

module.exports = class GuildPreference {

    constructor() {
        this._gameOptions = DEFAULT_OPTIONS;
        this._botPrefix = DEFAULT_BOT_PREFIX;
    }

    setLimit(limit) {
        this._gameOptions.limit = limit;
    }

    resetLimit() {
        this._gameOptions.limit = DEFAULT_LIMIT;
    }

    getLimit() {
        return this._gameOptions.limit;
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
        this._gameOptions.gender = [GENDER.FEMALE];
    }

    setGender(genderArr) {
        let tempArr = genderArr.map(gender => gender.toLowerCase());
        this._gameOptions.gender = [...new Set(tempArr)];
        return this._gameOptions.gender;
    }

    getSQLGender() {
        return this._gameOptions.gender.join(",");
    }

    setBotPrefix(prefix) {
        this._botPrefix = prefix;
    }

    getBotPrefix() {
        return this._botPrefix;
    }
};
