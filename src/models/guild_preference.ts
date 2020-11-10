import Knex from "knex";
import { BEGINNING_SEARCH_YEAR } from "../commands/game_options/cutoff";
import { DEFAULT_LIMIT } from "../commands/game_options/limit";
import { GENDER } from "../commands/game_options/gender";
import { SeekType } from "../commands/game_options/seek";
import { ShuffleType } from "../commands/game_options/shuffle";
import _logger from "../logger";
import dbContext from "../database_context";
import { ModeType } from "../commands/game_options/mode";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const logger = _logger("guild_preference");

const DEFAULT_OPTIONS = {
    beginningYear: BEGINNING_SEARCH_YEAR,
    endYear: (new Date()).getFullYear(),
    gender: [GENDER.FEMALE],
    limit: DEFAULT_LIMIT,
    seekType: SeekType.RANDOM,
    modeType: ModeType.SONG_NAME,
    shuffleType: ShuffleType.RANDOM,
    groups: null,
    goal: null,
    guessTimeout: null,
};

interface GameOptions {
    beginningYear: number;
    endYear: number;
    gender: GENDER[];
    limit: number;
    seekType: SeekType;
    modeType: ModeType;
    shuffleType: ShuffleType;
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
        // apply default game option for empty
        let gameOptionModified = false;
        for (const defaultOption in DEFAULT_OPTIONS) {
            if (!(defaultOption in this.gameOptions)) {
                this.gameOptions[defaultOption] = DEFAULT_OPTIONS[defaultOption];
                gameOptionModified = true;
            }
        }

        // extraneous keys
        for (const option in this.gameOptions) {
            if (!(option in DEFAULT_OPTIONS)) {
                delete this.gameOptions[option];
                gameOptionModified = true;
            }
        }
        if (gameOptionModified) {
            this.updateGuildPreferences(dbContext.kmq);
        }
    }

    setLimit(limit: number) {
        this.gameOptions.limit = limit;
        this.updateGuildPreferences(dbContext.kmq);
    }

    resetLimit() {
        this.gameOptions.limit = DEFAULT_LIMIT;
        this.updateGuildPreferences(dbContext.kmq);
    }

    getLimit(): number {
        return this.gameOptions.limit;
    }

    setBeginningCutoffYear(year: number) {
        this.gameOptions.beginningYear = year;
        this.updateGuildPreferences(dbContext.kmq);
    }

    resetBeginningCutoffYear() {
        this.gameOptions.beginningYear = BEGINNING_SEARCH_YEAR;
        this.updateGuildPreferences(dbContext.kmq);
    }

    getBeginningCutoffYear(): number {
        return this.gameOptions.beginningYear;
    }

    setEndCutoffYear(year: number) {
        this.gameOptions.endYear = year;
        this.updateGuildPreferences(dbContext.kmq);
    }

    resetEndCutoffYear() {
        this.gameOptions.endYear = (new Date()).getFullYear();
        this.updateGuildPreferences(dbContext.kmq);
    }

    getEndCutoffYear(): number {
        return this.gameOptions.endYear;
    }

    setGroups(groupIds: { id: number, name: string }[]) {
        this.gameOptions.groups = groupIds;
        this.updateGuildPreferences(dbContext.kmq);
    }

    resetGroups() {
        this.gameOptions.groups = null;
        this.updateGuildPreferences(dbContext.kmq);
    }

    getGroupIds(): number[] {
        if (this.gameOptions.groups === null) return null;
        return this.gameOptions.groups.map((x) => x.id);
    }

    getDisplayedGroupNames(): string {
        if (this.gameOptions.groups === null) return null;
        let displayedGroupNames = this.gameOptions.groups.map((x) => x.name).join(", ");
        if (displayedGroupNames.length > 400) {
            displayedGroupNames = `${displayedGroupNames.substr(0, 400)} and many others...`;
        }
        return displayedGroupNames;
    }

    resetGender() {
        this.gameOptions.gender = [GENDER.FEMALE];
        this.updateGuildPreferences(dbContext.kmq);
    }

    setGender(genderArr: GENDER[]): Array<string> {
        this.gameOptions.gender = [...new Set(genderArr)];
        this.updateGuildPreferences(dbContext.kmq);
        return this.gameOptions.gender;
    }

    getSQLGender(): string {
        return this.gameOptions.gender.join(",");
    }

    setSeekType(seekType: SeekType) {
        this.gameOptions.seekType = seekType;
        this.updateGuildPreferences(dbContext.kmq);
    }

    getSeekType(): SeekType {
        return this.gameOptions.seekType;
    }

    setModeType(modeType: ModeType) {
        this.gameOptions.modeType = modeType as ModeType;
        this.updateGuildPreferences(dbContext.kmq);
    }

    getModeType(): ModeType {
        return this.gameOptions.modeType;
    }

    setGoal(goal: number) {
        this.gameOptions.goal = goal;
        this.updateGuildPreferences(dbContext.kmq);
    }

    getGoal(): number {
        return this.gameOptions.goal;
    }

    resetGoal() {
        this.gameOptions.goal = null;
        this.updateGuildPreferences(dbContext.kmq);
    }

    isGoalSet(): boolean {
        return this.gameOptions.goal !== null;
    }

    setGuessTimeout(guessTimeout: number) {
        this.gameOptions.guessTimeout = guessTimeout;
        this.updateGuildPreferences(dbContext.kmq);
    }

    getGuessTimeout(): number {
        return this.gameOptions.guessTimeout;
    }

    resetGuessTimeout() {
        this.gameOptions.guessTimeout = null;
        this.updateGuildPreferences(dbContext.kmq);
    }

    isGuessTimeoutSet(): boolean {
        return this.gameOptions.guessTimeout !== null;
    }

    setShuffleType(shuffleType: ShuffleType) {
        this.gameOptions.shuffleType = shuffleType;
        this.updateGuildPreferences(dbContext.kmq);
    }

    getShuffleType(): ShuffleType {
        return this.gameOptions.shuffleType;
    }

    isShuffleUnique(): boolean {
        return this.gameOptions.shuffleType === ShuffleType.UNIQUE;
    }

    async updateGuildPreferences(_db: Knex) {
        await _db("guild_preferences")
            .where({ guild_id: this.guildID })
            .update({ guild_preference: JSON.stringify(this) });
    }
}
