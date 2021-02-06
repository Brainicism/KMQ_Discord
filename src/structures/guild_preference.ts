import Knex from "knex";
import { DEFAULT_BEGINNING_SEARCH_YEAR, DEFAULT_ENDING_SEARCH_YEAR } from "../commands/game_options/cutoff";
import { DEFAULT_LIMIT } from "../commands/game_options/limit";
import { GENDER, DEFAULT_GENDER } from "../commands/game_options/gender";
import { SeekType, DEFAULT_SEEK } from "../commands/game_options/seek";
import { ShuffleType, DEFAULT_SHUFFLE } from "../commands/game_options/shuffle";
import { ModeType, DEFAULT_MODE } from "../commands/game_options/mode";
import _logger from "../logger";
import dbContext from "../database_context";
import state from "../kmq";
import { ArtistType, DEFAULT_ARTIST_TYPE } from "../commands/game_options/artisttype";
import { DEFAULT_LANGUAGE, LanguageType } from "../commands/game_options/language";
import { DEFAULT_SUBUNIT_PREFERENCE, SubunitsPreference } from "../commands/game_options/subunits";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const logger = _logger("guild_preference");

const DEFAULT_OPTIONS = {
    beginningYear: DEFAULT_BEGINNING_SEARCH_YEAR,
    endYear: DEFAULT_ENDING_SEARCH_YEAR,
    gender: DEFAULT_GENDER,
    limitEnd: DEFAULT_LIMIT,
    limitStart: 0,
    seekType: DEFAULT_SEEK,
    modeType: DEFAULT_MODE,
    shuffleType: DEFAULT_SHUFFLE,
    groups: null,
    excludes: null,
    goal: null,
    guessTimeout: null,
    artistType: DEFAULT_ARTIST_TYPE,
    languageType: DEFAULT_LANGUAGE,
    subunitPreference: DEFAULT_SUBUNIT_PREFERENCE,
};

interface GameOptions {
    beginningYear: number;
    endYear: number;
    gender: Array<GENDER>;
    limitStart: number;
    limitEnd: number;
    seekType: SeekType;
    modeType: ModeType;
    artistType: ArtistType;
    shuffleType: ShuffleType;
    groups: { id: number, name: string }[];
    excludes: { id: number, name: string }[];
    goal: number;
    guessTimeout: number;
    languageType: LanguageType;
    subunitPreference: SubunitsPreference;
}

export default class GuildPreference {
    /** The Discord Guild ID */
    private readonly guildID: string;

    /** The GuildPreference's respective GameOptions */
    private gameOptions: GameOptions;

    constructor(guildID: string, json?: GuildPreference) {
        this.guildID = guildID;
        if (!json) {
            this.gameOptions = { ...DEFAULT_OPTIONS };
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

    /**
     * Sets the limit option value
     * @param limit - The limit range value
     */
    setLimit(limitStart: number, limitEnd: number) {
        this.gameOptions.limitEnd = limitEnd;
        this.gameOptions.limitStart = limitStart;
        this.updateGuildPreferences(dbContext.kmq);
        this.updateGameSession(true);
    }

    /** Resets the limit option to the default value */
    resetLimit() {
        this.gameOptions.limitEnd = DEFAULT_LIMIT;
        this.gameOptions.limitStart = null;
        this.updateGuildPreferences(dbContext.kmq);
        this.updateGameSession(true);
    }

    /** @returns the current limit start option value */
    getLimitStart(): number {
        return this.gameOptions.limitStart;
    }

    /** @returns the current limit end option value */
    getLimitEnd(): number {
        return this.gameOptions.limitEnd;
    }

    /**
     * Sets the beginning cutoff year option value
     * @param year - The beginning cutoff year
     */
    setBeginningCutoffYear(year: number) {
        this.gameOptions.beginningYear = year;
        this.updateGuildPreferences(dbContext.kmq);
        this.updateGameSession(true);
    }

    /** Resets the beginning cutoff year option to the default value */
    resetBeginningCutoffYear() {
        this.gameOptions.beginningYear = DEFAULT_BEGINNING_SEARCH_YEAR;
        this.updateGuildPreferences(dbContext.kmq);
        this.updateGameSession(true);
    }

    /** @returns the current beginning cutoff year option value */
    getBeginningCutoffYear(): number {
        return this.gameOptions.beginningYear;
    }

    /**
     * Sets the end cutoff year option value
     * @param year - The end cutoff year
     */
    setEndCutoffYear(year: number) {
        this.gameOptions.endYear = year;
        this.updateGuildPreferences(dbContext.kmq);
        this.updateGameSession(true);
    }

    /** Resets the end cutoff year option to the default value */
    resetEndCutoffYear() {
        this.gameOptions.endYear = DEFAULT_ENDING_SEARCH_YEAR;
        this.updateGuildPreferences(dbContext.kmq);
        this.updateGameSession(true);
    }

    /** @returns the current end cutoff year option value */
    getEndCutoffYear(): number {
        return this.gameOptions.endYear;
    }

    /** @returns whether the group option is active */
    isGroupsMode(): boolean {
        return this.getGroupIds().length !== 0;
    }

    /**
     * Sets the groups option value
     * @param groupIds - A list of kpop groups, ID and name
     */
    setGroups(groupIds: { id: number, name: string }[]) {
        this.gameOptions.groups = groupIds;
        this.updateGuildPreferences(dbContext.kmq);
        this.updateGameSession(true);
    }

    /** Resets the groups option to the default value */
    resetGroups() {
        this.gameOptions.groups = null;
        this.updateGuildPreferences(dbContext.kmq);
        this.updateGameSession(true);
    }

    /** @returns the current selected groups, if the groups option is active */
    getGroupIds(): number[] {
        if (this.gameOptions.groups === null) return [];
        return this.gameOptions.groups.map((x) => x.id);
    }

    /** @returns a friendly, potentially truncuated, string displaying the currently selected groups option */
    getDisplayedGroupNames(): string {
        if (this.gameOptions.groups === null) return null;
        let displayedGroupNames = this.gameOptions.groups
            .filter((x) => !x.name.includes("+"))
            .map((x) => x.name).join(", ");
        if (displayedGroupNames.length > 400) {
            displayedGroupNames = `${displayedGroupNames.substr(0, 400)} and many others...`;
        }
        return displayedGroupNames;
    }

    /** @returns whether the exclude option is active */
    isExcludesMode(): boolean {
        return this.getExcludesGroupIds().length !== 0;
    }

    /**
     * Sets the exclude option value
     * @param groupIds - A list of kpop groups, ID and name
     */
    setExcludes(groupIds: { id: number, name: string }[]) {
        this.gameOptions.excludes = groupIds;
        this.updateGuildPreferences(dbContext.kmq);
        this.updateGameSession(true);
    }

    /** Resets the exclude option to the default value */
    resetExcludes() {
        this.gameOptions.excludes = null;
        this.updateGuildPreferences(dbContext.kmq);
        this.updateGameSession(true);
    }

    /** @returns a list containing the excluded group IDs */
    getExcludesGroupIds(): number[] {
        if (this.gameOptions.excludes === null) return [];
        return this.gameOptions.excludes.map((x) => x.id);
    }

    /** @returns a friendly, potentially truncuated, string displaying the currently selected exclude option */
    getDisplayedExcludesGroupNames(): string {
        if (this.gameOptions.excludes === null) return null;
        let displayedGroupNames = this.gameOptions.excludes.map((x) => x.name).join(", ");
        if (displayedGroupNames.length > 400) {
            displayedGroupNames = `${displayedGroupNames.substr(0, 400)} and many others...`;
        }
        return displayedGroupNames;
    }

    /** Resets the gender option to the default value */
    resetGender() {
        this.gameOptions.gender = DEFAULT_GENDER;
        this.updateGuildPreferences(dbContext.kmq);
        this.updateGameSession(true);
    }

    /**
     * Sets the gender option value
     * @param genderArr - A list of GENDER enums
     */
    setGender(genderArr: Array<GENDER>) {
        this.gameOptions.gender = [...new Set(genderArr)];
        this.updateGuildPreferences(dbContext.kmq);
        this.updateGameSession(true);
    }

    /** @returns an array containing the currently selected gender option */
    getGender(): Array<GENDER> {
        return this.gameOptions.gender;
    }

    /** @returns whether gender is set to alternating */
    isGenderAlternating(): boolean {
        return this.getGender()[0] === GENDER.ALTERNATING;
    }

    /**
     * Sets the seek type option value
     * @param seekType - The SeekType
     */
    setSeekType(seekType: SeekType) {
        this.gameOptions.seekType = seekType;
        this.updateGuildPreferences(dbContext.kmq);
        this.updateGameSession(false);
    }

    /** Gets the current seek type option value */
    getSeekType(): SeekType {
        return this.gameOptions.seekType;
    }

    /** Resets the seek type option to the default value */
    resetSeekType() {
        this.gameOptions.seekType = DEFAULT_SEEK;
        this.updateGuildPreferences(dbContext.kmq);
        this.updateGameSession(false);
    }

    /** @returns the current artist type option value */
    getArtistType(): ArtistType {
        return this.gameOptions.artistType;
    }

    /** Resets the artist type option to the default value */
    resetArtistType() {
        this.gameOptions.artistType = DEFAULT_ARTIST_TYPE;
        this.updateGuildPreferences(dbContext.kmq);
        this.updateGameSession(true);
    }

    /**
     * Sets the artist type option value
     * @param artistType - The ArtistType
     */
    setArtistType(artistType: ArtistType) {
        this.gameOptions.artistType = artistType as ArtistType;
        this.updateGuildPreferences(dbContext.kmq);
        this.updateGameSession(true);
    }

    /** @returns the current subunit preference option value */
    getSubunitPreference(): SubunitsPreference {
        return this.gameOptions.subunitPreference;
    }

    /** Resets the subunit preference option to the default value */
    resetSubunitPreference() {
        this.gameOptions.subunitPreference = DEFAULT_SUBUNIT_PREFERENCE;
        this.updateGuildPreferences(dbContext.kmq);
        this.updateGameSession(true);
    }

    /**
     * Sets the subunit preference option value
     * @param subunitPreference - The SubunitsPreference
     */
    setSubunitPreference(subunitPreference: SubunitsPreference) {
        this.gameOptions.subunitPreference = subunitPreference as SubunitsPreference;
        this.updateGuildPreferences(dbContext.kmq);
        this.updateGameSession(true);
    }

    /**
     * Sets the mode type option value
     * @param modeType - The ModeType
     */
    setModeType(modeType: ModeType) {
        this.gameOptions.modeType = modeType as ModeType;
        this.updateGuildPreferences(dbContext.kmq);
        this.updateGameSession(false);
    }

    /** @returns the current mode type option value */
    getModeType(): ModeType {
        return this.gameOptions.modeType;
    }

    /** Resets the mode type option to the default value */
    resetModeType() {
        this.gameOptions.modeType = DEFAULT_MODE;
        this.updateGuildPreferences(dbContext.kmq);
        this.updateGameSession(false);
    }

    /**
     * Sets the goal option value
     * @param goal - The goal option
     */
    setGoal(goal: number) {
        this.gameOptions.goal = goal;
        this.updateGuildPreferences(dbContext.kmq);
        this.updateGameSession(false);
    }

    /** @returns the current goal option value */
    getGoal(): number {
        return this.gameOptions.goal;
    }

    /** Resets the goal option to the default value */
    resetGoal() {
        this.gameOptions.goal = null;
        this.updateGuildPreferences(dbContext.kmq);
        this.updateGameSession(false);
    }

    /** @returns whether the goal option is set */
    isGoalSet(): boolean {
        return this.gameOptions.goal !== null;
    }

    /**
     * Sets the timer option value
     * @param guessTimeout - The timer option
     */
    setGuessTimeout(guessTimeout: number) {
        this.gameOptions.guessTimeout = guessTimeout;
        this.updateGuildPreferences(dbContext.kmq);
        this.updateGameSession(false);
    }

    /** @returns the current timer option value */
    getGuessTimeout(): number {
        return this.gameOptions.guessTimeout;
    }

    /** Resets the timer option to the default value */
    resetGuessTimeout() {
        this.gameOptions.guessTimeout = null;
        this.updateGuildPreferences(dbContext.kmq);
        this.updateGameSession(false);
    }

    /** @returns whether the timer option is active */
    isGuessTimeoutSet(): boolean {
        return this.gameOptions.guessTimeout !== null;
    }

    /**
     * Sets the shuffle type option value
     * @param shuffleType - The shuffle type
     */
    setShuffleType(shuffleType: ShuffleType) {
        this.gameOptions.shuffleType = shuffleType;

        // Doesn't actually modify list of available_songs, but we need to
        // reset lastPlayedSongsQueue when changing shuffling modes
        this.updateGuildPreferences(dbContext.kmq);
        this.updateGameSession(true);
    }

    /** Returns the current shuffle type option value */
    getShuffleType(): ShuffleType {
        return this.gameOptions.shuffleType;
    }

    /** Resets the shuffle type to the default value */
    resetShuffleType() {
        this.gameOptions.shuffleType = DEFAULT_SHUFFLE;
        this.updateGuildPreferences(dbContext.kmq);
        this.updateGameSession(false);
    }

    /** @returns whether the current shuffle type is UNIQUE */
    isShuffleUnique(): boolean {
        return this.gameOptions.shuffleType === ShuffleType.UNIQUE;
    }

    /**
     * Sets the language type option value
     * @param languageType - The language type
     */
    setLanguageType(languageType: LanguageType) {
        this.gameOptions.languageType = languageType;
        this.updateGuildPreferences(dbContext.kmq);
        this.updateGameSession(true);
    }

    /** @returns the langauge type option value */
    getLanguageType(): LanguageType {
        return this.gameOptions.languageType;
    }

    /** Resets the language type option the the default value */
    resetLanguageType() {
        this.gameOptions.languageType = DEFAULT_LANGUAGE;
        this.updateGuildPreferences(dbContext.kmq);
        this.updateGameSession(true);
    }

    /**
     * Persists the current guild preference to the data store
     * @param _db - The Knex database connection
     */
    async updateGuildPreferences(_db: Knex) {
        await _db("guild_preferences")
            .where({ guild_id: this.guildID })
            .update({ guild_preference: JSON.stringify(this) });
    }

    /**
     * Performs any actions on GameSession required upon game option change
     * @param songListModified - Whether the updated game option modified the list of available songs
     */
    updateGameSession(songListModified: boolean) {
        const gameSession = state.gameSessions[this.guildID];
        if (gameSession && songListModified) {
            gameSession.resetLastPlayedSongsQueue();
        }
    }

    /** Resets all options to the default value */
    resetToDefault() {
        this.gameOptions = { ...DEFAULT_OPTIONS };
        this.updateGuildPreferences(dbContext.kmq);
        this.updateGameSession(true);
    }
}
