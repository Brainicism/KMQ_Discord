import { BEGINNING_SEARCH_YEAR } from "../commands/cutoff";
import { DEFAULT_BOT_PREFIX } from "../commands/prefix";
import { DEFAULT_LIMIT } from "../commands/limit";
import { DEFAULT_VOLUME } from "../commands/volume";
import { GENDER } from "../commands/gender";
import { SEEK_TYPE } from "../commands/seek";
import _logger from "../logger";
import * as Knex from "knex";
import { db } from "../databases";
import { MODE_TYPE } from "../commands/mode";
const logger = _logger("guild_preference");

const DEFAULT_OPTIONS = {
    beginningYear: BEGINNING_SEARCH_YEAR, endYear: (new Date()).getFullYear(), gender: [GENDER.FEMALE],
    limit: DEFAULT_LIMIT, volume: DEFAULT_VOLUME, seekType: SEEK_TYPE.RANDOM, modeType: MODE_TYPE.SONG_NAME, groups: null
};
interface GameOptions {
    beginningYear: number;
    endYear: number;
    gender: GENDER[];
    limit: number;
    volume: number;
    seekType: SEEK_TYPE;
    modeType: MODE_TYPE;
    groups: { id: number, name: string }[];
}

export default class GuildPreference {
    private guildID: string;
    private botPrefix: string;
    private gameOptions: GameOptions;

    constructor(guildID: string, json?: GuildPreference) {
        this.guildID = guildID;
        if (!json) {
            this.gameOptions = DEFAULT_OPTIONS;
            this.botPrefix = DEFAULT_BOT_PREFIX;
            return;
        }
        this.gameOptions = json.gameOptions;
        this.botPrefix = json.botPrefix;
        //apply default game option for empty
        let missingOptionAdded = false;
        for (let defaultOption in DEFAULT_OPTIONS) {
            if (!(defaultOption in this.gameOptions)) {
                this.gameOptions[defaultOption] = DEFAULT_OPTIONS[defaultOption];
                missingOptionAdded = true;
            }
        }
        if (missingOptionAdded) {
            this.updateGuildPreferences(db.kmq);
        }
    }

    setLimit(limit: number) {
        this.gameOptions.limit = limit;
        this.updateGuildPreferences(db.kmq);
    }

    resetLimit() {
        this.gameOptions.limit = DEFAULT_LIMIT;
        this.updateGuildPreferences(db.kmq);
    }

    getLimit(): number {
        return this.gameOptions.limit;
    }

    setBeginningCutoffYear(year: number) {
        this.gameOptions.beginningYear = year;
        this.updateGuildPreferences(db.kmq);
    }

    resetBeginningCutoffYear() {
        this.gameOptions.beginningYear = BEGINNING_SEARCH_YEAR;
        this.updateGuildPreferences(db.kmq);
    }

    getBeginningCutoffYear(): number {
        return this.gameOptions.beginningYear;
    }

    getDefaultBeginningCutoffYear(): number {
        return BEGINNING_SEARCH_YEAR;
    }

    setEndCutoffYear(year: number) {
        this.gameOptions.endYear = year;
        this.updateGuildPreferences(db.kmq);
    }

    resetEndCutoffYear(year: number) {
        this.gameOptions.endYear = (new Date()).getFullYear();
        this.updateGuildPreferences(db.kmq);
    }

    getEndCutoffYear(): number {
        return this.gameOptions.endYear;
    }

    setGroups(groupIds: { id: number, name: string }[]) {
        this.gameOptions.groups = groupIds;
        this.updateGuildPreferences(db.kmq);
    }

    resetGroups() {
        this.gameOptions.groups = null;
        this.updateGuildPreferences(db.kmq);
    }

    getGroupIds(): number[] {
        if (this.gameOptions.groups === null) return null;
        return this.gameOptions.groups.map((x) => x["id"]);
    }

    getGroupNames(): string[] {
        if (this.gameOptions.groups === null) return null;
        return this.gameOptions.groups.map((x) => x["name"]);
    }

    resetGender() {
        this.gameOptions.gender = [GENDER.FEMALE];
        this.updateGuildPreferences(db.kmq);
    }

    setGender(genderArr: GENDER[]): Array<string> {
        this.gameOptions.gender = [...new Set(genderArr)];
        this.updateGuildPreferences(db.kmq);
        return this.gameOptions.gender;
    }

    getSQLGender(): string {
        return this.gameOptions.gender.join(",");
    }

    setBotPrefix(prefix: string) {
        this.botPrefix = prefix;
        this.updateGuildPreferences(db.kmq);
    }

    getBotPrefix(): string {
        return this.botPrefix;
    }

    setSeekType(seekType: SEEK_TYPE) {
        this.gameOptions.seekType = seekType;
        this.updateGuildPreferences(db.kmq);
    }

    getSeekType(): SEEK_TYPE {
        return this.gameOptions.seekType;
    }

    setModeType(modeType: MODE_TYPE) {
        this.gameOptions.modeType = modeType as MODE_TYPE;
        this.updateGuildPreferences(db.kmq);
    }

    getModeType(): MODE_TYPE {
        return this.gameOptions.modeType;
    }

    setVolume(volume: number) {
        this.gameOptions.volume = volume;
        this.updateGuildPreferences(db.kmq);
    }

    getVolume(): number {
        return this.gameOptions.volume;
    }

    getStreamVolume(): number {
        return this.getVolume() / 150;
    }

    async updateGuildPreferences(db: Knex) {
        await db("guild_preferences")
            .where({ guild_id: this.guildID })
            .update({ guild_preference: JSON.stringify(this) });
    }
};

