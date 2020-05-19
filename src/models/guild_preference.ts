import { BEGINNING_SEARCH_YEAR } from "../commands/cutoff";
import { DEFAULT_BOT_PREFIX } from "../commands/prefix";
import { DEFAULT_LIMIT } from "../commands/limit";
import { DEFAULT_VOLUME } from "../commands/volume";
import { GENDER } from "../commands/gender";
import { Pool } from "promise-mysql";

const DEFAULT_OPTIONS = { beginningYear: BEGINNING_SEARCH_YEAR, gender: [GENDER.FEMALE], limit: DEFAULT_LIMIT, volume: DEFAULT_VOLUME };
interface GameOption {
    beginningYear: number;
    gender: string[];
    limit: number;
    volume: number;
}

class GuildPreference {
    private guildID: string;
    private botPrefix: string;
    private gameOptions: GameOption;

    constructor(guildID: string, json?: GuildPreference) {
        this.guildID = guildID;
        if (!json) {
            this.gameOptions = DEFAULT_OPTIONS;
            this.botPrefix = DEFAULT_BOT_PREFIX;
            return;
        }
        this.gameOptions = json.gameOptions;
        this.botPrefix = json.botPrefix;
    }

    setLimit(limit: number, db: Pool) {
        this.gameOptions.limit = limit;
        this.updateGuildPreferences(db);
    }

    resetLimit(db: Pool) {
        this.gameOptions.limit = DEFAULT_LIMIT;
        this.updateGuildPreferences(db);
    }

    getLimit(): number {
        return this.gameOptions.limit;
    }

    setBeginningCutoffYear(year: number, db: Pool) {
        this.gameOptions.beginningYear = year;
        this.updateGuildPreferences(db);
    }

    resetBeginningCutoffYear(db: Pool) {
        this.gameOptions.beginningYear = BEGINNING_SEARCH_YEAR;
        this.updateGuildPreferences(db);
    }

    getBeginningCutoffYear(): number {
        return this.gameOptions.beginningYear;
    }

    getDefaultBeginningCutoffYear(): number {
        return BEGINNING_SEARCH_YEAR;
    }

    resetGender(db: Pool) {
        this.gameOptions.gender = [GENDER.FEMALE];
        this.updateGuildPreferences(db);
    }

    setGender(genderArr: string[], db: Pool): Array<string> {
        let tempArr = genderArr.map(gender => gender.toLowerCase());
        this.gameOptions.gender = [...new Set(tempArr)];
        this.updateGuildPreferences(db);
        return this.gameOptions.gender;
    }

    getSQLGender(): string {
        return this.gameOptions.gender.join(",");
    }

    setBotPrefix(prefix: string, db: Pool) {
        this.botPrefix = prefix;
        this.updateGuildPreferences(db);
    }

    getBotPrefix(): string {
        return this.botPrefix;
    }

    setVolume(volume: number, db: Pool) {
        this.gameOptions.volume = volume;
        this.updateGuildPreferences(db);
    }

    getVolume(): number {
        return this.gameOptions.volume;
    }

    getStreamVolume(): number {
        return this.getVolume() / 500;
    }

    getCachedStreamVolume(): number {
        return this.getVolume() / 150;
    }

    updateGuildPreferences(db: Pool) {
        let guildPreferencesUpdate = `UPDATE kmq.guild_preferences SET guild_preference = ? WHERE guild_id = ?;`;
        db.query(guildPreferencesUpdate, [JSON.stringify(this), this.guildID]);
    }
};

export default GuildPreference;