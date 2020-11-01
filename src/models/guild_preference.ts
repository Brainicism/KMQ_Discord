import { BEGINNING_SEARCH_YEAR } from "../commands/game_options/cutoff";
import { DEFAULT_LIMIT } from "../commands/game_options/limit";
import { GENDER } from "../commands/game_options/gender";
import { SEEK_TYPE } from "../commands/game_options/seek";
import _logger from "../logger";
import Knex from "knex";
import { db } from "../database_context";
import { MODE_TYPE } from "../commands/game_options/mode";
const logger = _logger("guild_preference");

const DEFAULT_OPTIONS = {
    beginningYear: BEGINNING_SEARCH_YEAR, endYear: (new Date()).getFullYear(), gender: [GENDER.FEMALE],
    limit: DEFAULT_LIMIT, seekType: SEEK_TYPE.RANDOM, modeType: MODE_TYPE.SONG_NAME, groups: null, goal: null, guessTimeout: null
};

export const DEFAULT_BOT_PREFIX = ",";

interface GameOptions {
    beginningYear: number;
    endYear: number;
    gender: GENDER[];
    limit: number;
    seekType: SEEK_TYPE;
    modeType: MODE_TYPE;
    groups: { id: number, name: string }[];
    goal: number;
    guessTimeout: number;
}

export default class GuildPreference {
    private guildID: string;
    private gameOptions: GameOptions;

    constructor(guildID: string, json?: GuildPreference) {
        this.guildID = guildID;
        if (!json) {
            this.gameOptions = DEFAULT_OPTIONS;
            return;
        }
        this.gameOptions = json.gameOptions;
        //apply default game option for empty
        let gameOptionModified = false;
        for (let defaultOption in DEFAULT_OPTIONS) {
            if (!(defaultOption in this.gameOptions)) {
                this.gameOptions[defaultOption] = DEFAULT_OPTIONS[defaultOption];
                gameOptionModified = true;
            }
        }

        //extraneous keys
        for (let option in this.gameOptions) {
            if (!(option in DEFAULT_OPTIONS)) {
                console.log("Extra" + option);
                delete this.gameOptions[option];
                gameOptionModified = true;
            }
        }
        if (gameOptionModified) {
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

    setGoal(goal: number) {
        this.gameOptions.goal = goal;
        this.updateGuildPreferences(db.kmq);
    }

    getGoal(): number {
        return this.gameOptions.goal;
    }

    resetGoal() {
        this.gameOptions.goal = null;
        this.updateGuildPreferences(db.kmq);
    }

    isGoalSet(): boolean {
        return this.gameOptions.goal !== null;
    }

    setGuessTimeout(guessTimeout: number) {
        this.gameOptions.guessTimeout = guessTimeout;
        this.updateGuildPreferences(db.kmq);
    }

    getGuessTimeout(): number {
        return this.gameOptions.guessTimeout;
    }

    resetGuessTimeout() {
        this.gameOptions.guessTimeout = null;
        this.updateGuildPreferences(db.kmq);
    }

    isGuessTimeoutSet(): boolean {
        return this.gameOptions.guessTimeout !== null;
    }

    async updateGuildPreferences(db: Knex) {
        await db("guild_preferences")
            .where({ guild_id: this.guildID })
            .update({ guild_preference: JSON.stringify(this) });
    }
};

