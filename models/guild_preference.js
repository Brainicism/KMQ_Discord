const BEGINNING_SEARCH_YEAR = require("../commands/cutoff").BEGINNING_SEARCH_YEAR;
const DEFAULT_BOT_PREFIX = "!";
const DEFAULT_LIMIT = require("../commands/limit").DEFAULT_LIMIT;
const GENDER = require("../commands/gender").GENDER;
const DEFAULT_OPTIONS = { beginningYear: BEGINNING_SEARCH_YEAR, gender: [GENDER.FEMALE], limit: DEFAULT_LIMIT };

module.exports = class GuildPreference {

    constructor(guildID, json) {
        this._guildID = guildID;
        if (!json) {
            this._gameOptions = DEFAULT_OPTIONS;
            this._botPrefix = DEFAULT_BOT_PREFIX;
            return;
        }
        this._gameOptions = json._gameOptions;
        this._botPrefix = json._botPrefix;
    }

    setLimit(limit, db) {
        this._gameOptions.limit = limit;
        this.updateGuildPreferences(db);
    }

    resetLimit(db) {
        this._gameOptions.limit = DEFAULT_LIMIT;
        this.updateGuildPreferences(db);
    }

    getLimit() {
        return this._gameOptions.limit;
    }

    setBeginningCutoffYear(year, db) {
        this._gameOptions.beginningYear = year;
        this.updateGuildPreferences(db);
    }

    resetBeginningCutoffYear(db) {
        this._gameOptions.beginningYear = BEGINNING_SEARCH_YEAR;
        this.updateGuildPreferences(db);
    }

    getBeginningCutoffYear() {
        return this._gameOptions.beginningYear;
    }

    getDefaultBeginningCutoffYear() {
        return BEGINNING_SEARCH_YEAR;
    }

    resetGender(db) {
        this._gameOptions.gender = [GENDER.FEMALE];
        this.updateGuildPreferences(db);
    }

    setGender(genderArr, db) {
        let tempArr = genderArr.map(gender => gender.toLowerCase());
        this._gameOptions.gender = [...new Set(tempArr)];
        this.updateGuildPreferences(db);
        return this._gameOptions.gender;
    }

    getSQLGender() {
        return this._gameOptions.gender.join(",");
    }

    setBotPrefix(prefix, db) {
        this._botPrefix = prefix;
        this.updateGuildPreferences(db);
    }

    getBotPrefix() {
        return this._botPrefix;
    }

    updateGuildPreferences(db) {
        let guildPreferencesUpdate = `UPDATE guild_preferences SET guild_preference = ? WHERE guild_id = ?;`;
        db.query(guildPreferencesUpdate, [JSON.stringify(this), this._guildID]);
    }
};
