import _ from "lodash";
import { DEFAULT_BEGINNING_SEARCH_YEAR, DEFAULT_ENDING_SEARCH_YEAR } from "../commands/game_options/cutoff";
import { DEFAULT_LIMIT } from "../commands/game_options/limit";
import { Gender, DEFAULT_GENDER } from "../commands/game_options/gender";
import { SeekType, DEFAULT_SEEK } from "../commands/game_options/seek";
import { ShuffleType, DEFAULT_SHUFFLE } from "../commands/game_options/shuffle";
import { GuessModeType, DEFAULT_GUESS_MODE } from "../commands/game_options/guessmode";
import _logger from "../logger";
import dbContext from "../database_context";
import { ArtistType, DEFAULT_ARTIST_TYPE } from "../commands/game_options/artisttype";
import { DEFAULT_LANGUAGE, LanguageType } from "../commands/game_options/language";
import { DEFAULT_SUBUNIT_PREFERENCE, SubunitsPreference } from "../commands/game_options/subunits";
import { MatchedArtist } from "../types";
import { DEFAULT_OST_PREFERENCE, OstPreference } from "../commands/game_options/ost";
import { DEFAULT_RELEASE_TYPE, ReleaseType } from "../commands/game_options/release";
import { DEFAULT_MULTIGUESS_TYPE, MultiGuessType } from "../commands/game_options/multiguess";
import { state } from "../kmq";
import { SpecialType } from "../commands/game_options/special";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const logger = _logger("guild_preference");

interface GameOptions {
    beginningYear: number;
    endYear: number;
    gender: Array<Gender>;
    limitStart: number;
    limitEnd: number;
    seekType: SeekType;
    specialType: SpecialType;
    guessModeType: GuessModeType;
    releaseType: ReleaseType;
    artistType: ArtistType;
    shuffleType: ShuffleType;
    groups: MatchedArtist[];
    excludes: MatchedArtist[];
    includes: MatchedArtist[];
    goal: number;
    guessTimeout: number;
    duration: number;
    languageType: LanguageType;
    multiGuessType: MultiGuessType;
    subunitPreference: SubunitsPreference;
    ostPreference: OstPreference;
}

type GameOptionValue =
    number |
    Array<Gender> |
    SeekType |
    SpecialType |
    GuessModeType |
    ReleaseType |
    ArtistType |
    ShuffleType |
    MatchedArtist[] |
    LanguageType |
    MultiGuessType |
    SubunitsPreference |
    OstPreference;

const enum GameOptionInternal {
    BEGINNING_YEAR = "beginningYear",
    END_YEAR = "endYear",
    GENDER = "gender",
    LIMIT_START = "limitStart",
    LIMIT_END = "limitEnd",
    SEEK_TYPE = "seekType",
    SPECIAL_TYPE = "specialType",
    GUESS_MODE_TYPE = "guessModeType",
    RELEASE_TYPE = "releaseType",
    ARTIST_TYPE = "artistType",
    SHUFFLE_TYPE = "shuffleType",
    GROUPS = "groups",
    EXCLUDES = "excludes",
    INCLUDES = "includes",
    GOAL = "goal",
    GUESS_TIMEOUT = "guessTimeout",
    DURATION = "duration",
    LANGUAGE_TYPE = "languageType",
    MULTI_GUESS_TYPE = "multiGuessType",
    SUBUNIT_PREFERENCE = "subunitPreference",
    OST_PREFERENCE = "ostPreference",
}

/**
 * @param text - The text to truncate
 * @param length - The number of characters to truncate to
 * @returns the truncated string
 */
function getGroupNamesString(groups: MatchedArtist[], truncate = true, spaceDelimiter = true): string {
    let displayedGroupNames = groups
        .map((x) => x.name)
        .filter((name) => !name.includes("+"))
        .join(spaceDelimiter ? ", " : ",");
    if (truncate && displayedGroupNames.length > 200) {
        displayedGroupNames = `${displayedGroupNames.substr(0, 200)} and many others...`;
    }
    return displayedGroupNames;
}

export default class GuildPreference {
    static DEFAULT_OPTIONS = {
        beginningYear: DEFAULT_BEGINNING_SEARCH_YEAR,
        endYear: DEFAULT_ENDING_SEARCH_YEAR,
        gender: DEFAULT_GENDER,
        limitEnd: DEFAULT_LIMIT,
        limitStart: 0,
        seekType: DEFAULT_SEEK,
        specialType: null,
        guessModeType: DEFAULT_GUESS_MODE,
        releaseType: DEFAULT_RELEASE_TYPE,
        shuffleType: DEFAULT_SHUFFLE,
        groups: null,
        excludes: null,
        includes: null,
        goal: null,
        guessTimeout: null,
        duration: null,
        artistType: DEFAULT_ARTIST_TYPE,
        languageType: DEFAULT_LANGUAGE,
        multiGuessType: DEFAULT_MULTIGUESS_TYPE,
        subunitPreference: DEFAULT_SUBUNIT_PREFERENCE,
        ostPreference: DEFAULT_OST_PREFERENCE,
    };

    public gameOptions: GameOptions;

    /** The Discord Guild ID */
    private readonly guildID: string;

    /** The GuildPreference's respective GameOptions */

    constructor(guildID: string, options?: GameOptions) {
        this.guildID = guildID;
        this.gameOptions = options || { ...GuildPreference.DEFAULT_OPTIONS };
    }

    static validateGameOptions(gameOptions: GameOptions): GameOptions {
        gameOptions = { ...gameOptions };

        // apply default game option for empty
        for (const defaultOption in GuildPreference.DEFAULT_OPTIONS) {
            if (!(defaultOption in gameOptions)) {
                gameOptions[defaultOption] = GuildPreference.DEFAULT_OPTIONS[defaultOption];
            }
        }

        // extraneous keys
        for (const option in gameOptions) {
            if (!(option in GuildPreference.DEFAULT_OPTIONS)) {
                delete gameOptions[option];
            }
        }

        return gameOptions;
    }

    /**
     * Constructs a GuildPreference from a JSON payload
     * @param guildID - The guild ID
     * @param gameOptionsJson - the JSON object representing the stored GameOption
     * @returns a new GuildPreference object
     */
    static fromGuild(guildID: string, gameOptionsJson?: Object): GuildPreference {
        if (!gameOptionsJson) {
            return new GuildPreference(guildID, { ...GuildPreference.DEFAULT_OPTIONS });
        }
        return new GuildPreference(guildID, this.validateGameOptions(gameOptionsJson as GameOptions));
    }

    /** @returns a list of saved game option presets by name */
    async listPresets(): Promise<string[]> {
        const presets = (await dbContext.kmq("game_option_presets")
            .select(["preset_name"])
            .where("guild_id", "=", this.guildID)
            .distinct("preset_name"))
            .map((x) => x["preset_name"]);
        return presets;
    }

    /**
     * @param presetName - The game preset to be deleted
     * @returns whether a preset was deleted
     */
    async deletePreset(presetName: string): Promise<boolean> {
        const result = await dbContext.kmq("game_option_presets")
            .where("guild_id", "=", this.guildID)
            .andWhere("preset_name", "=", presetName)
            .del();
        return result !== 0;
    }

    /**
     * @param presetName - The name of the preset to be saved
     * @returns whether the preset was saved
     */
    async savePreset(presetName: string): Promise<boolean> {
        try {
            const presetOptions = Object.entries(this.gameOptions).map((option) => ({
                guild_id: this.guildID,
                preset_name: presetName,
                option_name: option[0],
                option_value: JSON.stringify(option[1]),
            }));
            await dbContext.kmq.transaction(async (trx) => {
                await dbContext.kmq("game_option_presets")
                    .insert(presetOptions)
                    .transacting(trx);
            });
            return true;
        } catch (e) {
            return false;
        }
    }

    /**
     * @param presetName - The name of the preset to be loaded
     * @returns whether the preset was loaded
     */
    async loadPreset(presetName: string): Promise<boolean> {
        const preset: { [x: string]: any } = (await dbContext.kmq("game_option_presets")
            .select(["option_name", "option_value"])
            .where("guild_id", "=", this.guildID)
            .andWhere("preset_name", "=", presetName))
            .map((x) => ({ [x["option_name"]]: JSON.parse(x["option_value"]) }))
            .reduce(((total, curr) => Object.assign(total, curr)), {});

        if (!preset) {
            return false;
        }
        const oldOptions = this.gameOptions;
        this.gameOptions = GuildPreference.validateGameOptions(preset as GameOptions);
        const updatedOptions = Object.entries(this.gameOptions).filter((option) => !_.isEqual(oldOptions[option[0]], option[1]));
        if (updatedOptions.length === 0) {
            // User loads a preset with the exact same options as what is currently set
            return true;
        }
        const updatedOptionsObj = updatedOptions.map((x) => {
            const optionName = x[0];
            const optionValue = x[1];
            return { name: optionName, value: optionValue };
        });
        await this.updateGuildPreferences(updatedOptionsObj);
        return true;
    }

    /**
     * Sets the limit option value
     * @param limit - The limit range value
     */
    async setLimit(limitStart: number, limitEnd: number) {
        this.gameOptions.limitStart = limitStart;
        this.gameOptions.limitEnd = limitEnd;
        await this.updateGuildPreferences(
            [
                { name: GameOptionInternal.LIMIT_START, value: limitStart },
                { name: GameOptionInternal.LIMIT_END, value: limitEnd },
            ],
        );
    }

    /** Resets the limit option to the default value */
    async resetLimit() {
        await this.setLimit(0, DEFAULT_LIMIT);
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
    async setBeginningCutoffYear(year: number) {
        this.gameOptions.beginningYear = year;
        await this.updateGuildPreferences([{ name: GameOptionInternal.BEGINNING_YEAR, value: year }]);
    }

    /** Resets the beginning cutoff year option to the default value */
    async resetBeginningCutoffYear() {
        await this.setBeginningCutoffYear(DEFAULT_BEGINNING_SEARCH_YEAR);
    }

    /** @returns the current beginning cutoff year option value */
    getBeginningCutoffYear(): number {
        return this.gameOptions.beginningYear;
    }

    /**
     * Sets the end cutoff year option value
     * @param year - The end cutoff year
     */
    async setEndCutoffYear(year: number) {
        this.gameOptions.endYear = year;
        await this.updateGuildPreferences([{ name: GameOptionInternal.END_YEAR, value: year }]);
    }

    /** Resets the end cutoff year option to the default value */
    async resetEndCutoffYear() {
        await this.setEndCutoffYear(DEFAULT_ENDING_SEARCH_YEAR);
    }

    /** @returns the current end cutoff year option value */
    getEndCutoffYear(): number {
        return this.gameOptions.endYear;
    }

    /** @returns whether the group option is active */
    isGroupsMode(): boolean {
        return this.getGroupIDs().length !== 0;
    }

    /**
     * Sets the groups option value
     * @param groupIDs - A list of kpop groups (ID and name)
     */
    async setGroups(groups: MatchedArtist[]) {
        this.gameOptions.groups = groups;
        await this.updateGuildPreferences([{ name: GameOptionInternal.GROUPS, value: groups }]);
    }

    /** Resets the groups option to the default value */
    async resetGroups() {
        await this.setGroups(null);
    }

    /** @returns the current selected groups by ID, if the groups option is active */
    getGroupIDs(): number[] {
        if (this.gameOptions.groups === null) return [];
        return this.gameOptions.groups.map((x) => x.id);
    }

    /** @returns the current selected groups by name, if the groups option is active */
    getGroupNames(): string[] {
        if (this.gameOptions.groups === null) return [];
        return this.gameOptions.groups.map((x) => x.name);
    }

    /** @returns a friendly, potentially truncated, string displaying the currently selected groups option */
    getDisplayedGroupNames(original = false): string {
        if (this.gameOptions.groups === null) return null;
        if (original) {
            return getGroupNamesString(this.gameOptions.groups.filter((group) => !group.name.includes("+")), false, false);
        }
        const displayedGroupNames = getGroupNamesString(this.gameOptions.groups);
        return displayedGroupNames;
    }

    /** @returns whether the exclude option is active */
    isExcludesMode(): boolean {
        return this.getExcludesGroupIDs().length !== 0;
    }

    /**
     * Sets the exclude option value
     * @param groups - A list of kpop groups (ID and name)
     */
    async setExcludes(groups: MatchedArtist[]) {
        this.gameOptions.excludes = groups;
        await this.updateGuildPreferences([{ name: GameOptionInternal.EXCLUDES, value: groups }]);
    }

    /** Resets the exclude option to the default value */
    async resetExcludes() {
        await this.setExcludes(null);
    }

    /** @returns a list containing the excluded group IDs */
    getExcludesGroupIDs(): number[] {
        if (this.gameOptions.excludes === null) return [];
        return this.gameOptions.excludes.map((x) => x.id);
    }

    /** @returns a list containing the excluded group names */
    getExcludesGroupNames(): string[] {
        if (this.gameOptions.excludes === null) return [];
        return this.gameOptions.excludes.map((x) => x.name);
    }

    /** @returns a friendly, potentially truncated, string displaying the currently selected exclude option */
    getDisplayedExcludesGroupNames(original = false): string {
        if (this.gameOptions.excludes === null) return null;
        if (original) {
            return getGroupNamesString(this.gameOptions.excludes.filter((group) => !group.name.includes("+")), false, false);
        }
        const displayedGroupNames = getGroupNamesString(this.gameOptions.excludes);
        return displayedGroupNames;
    }

    /** @returns whether the exclude option is active */
    isIncludesMode(): boolean {
        return this.getIncludesGroupIDs().length !== 0;
    }

    /**
     * Sets the include option value
     * @param groupIDs - A list of kpop groups (ID and name)
     */
    async setIncludes(groups: MatchedArtist[]) {
        this.gameOptions.includes = groups;
        await this.updateGuildPreferences([{ name: GameOptionInternal.INCLUDES, value: groups }]);
    }

    /** Resets the include option to the default value */
    async resetIncludes() {
        await this.setIncludes(null);
    }

    /** @returns a list containing the excluded group IDs */
    getIncludesGroupIDs(): number[] {
        if (this.gameOptions.includes === null) return [];
        return this.gameOptions.includes.map((x) => x.id);
    }

    /** @returns a friendly, potentially truncated, string displaying the currently selected include option */
    getDisplayedIncludesGroupNames(original = false): string {
        if (this.gameOptions.includes === null) return null;
        if (original) {
            return getGroupNamesString(this.gameOptions.includes.filter((group) => !group.name.includes("+")), false, false);
        }
        const displayedGroupNames = getGroupNamesString(this.gameOptions.includes);
        return displayedGroupNames;
    }

    /** Resets the gender option to the default value */
    async resetGender() {
        await this.setGender(DEFAULT_GENDER);
    }

    /**
     * Sets the gender option value
     * @param genderArr - A list of GENDER enums
     */
    async setGender(genderArr: Array<Gender>) {
        this.gameOptions.gender = [...new Set(genderArr)];
        await this.updateGuildPreferences([{ name: GameOptionInternal.GENDER, value: this.gameOptions.gender }]);
    }

    /** @returns an array containing the currently selected gender option */
    getGender(): Array<Gender> {
        return this.gameOptions.gender;
    }

    /** @returns whether gender is set to alternating */
    isGenderAlternating(): boolean {
        return this.getGender()[0] === Gender.ALTERNATING;
    }

    /**
     * Sets the seek type option value
     * @param seekType - The SeekType
     */
    async setSeekType(seekType: SeekType) {
        this.gameOptions.seekType = seekType;
        await this.updateGuildPreferences([{ name: GameOptionInternal.SEEK_TYPE, value: seekType }]);
    }

    /** Gets the current seek type option value */
    getSeekType(): SeekType {
        return this.gameOptions.seekType;
    }

    /** Resets the seek type option to the default value */
    async resetSeekType() {
        await this.setSeekType(DEFAULT_SEEK);
    }

    /**
     * Sets the special type option value
     * @param specialType - The SpecialType
     */
    async setSpecialType(specialType: SpecialType) {
        this.gameOptions.specialType = specialType;
        await this.updateGuildPreferences([{ name: GameOptionInternal.SPECIAL_TYPE, value: specialType }]);
    }

    /** Gets the current special type option value */
    getSpecialType(): SpecialType {
        return this.gameOptions.specialType;
    }

    /** Resets the special type option to the default value */
    async resetSpecialType() {
        await this.setSpecialType(null);
    }

    /** @returns the current artist type option value */
    getArtistType(): ArtistType {
        return this.gameOptions.artistType;
    }

    /** Resets the artist type option to the default value */
    async resetArtistType() {
        await this.setArtistType(DEFAULT_ARTIST_TYPE);
    }

    /**
     * Sets the artist type option value
     * @param artistType - The ArtistType
     */
    async setArtistType(artistType: ArtistType) {
        this.gameOptions.artistType = artistType;
        await this.updateGuildPreferences([{ name: GameOptionInternal.ARTIST_TYPE, value: artistType }]);
    }

    /**
     * Sets the subunit preference option value
     * @param subunitPreference - The SubunitsPreference
     */
    async setSubunitPreference(subunitPreference: SubunitsPreference) {
        this.gameOptions.subunitPreference = subunitPreference;
        await this.updateGuildPreferences([{ name: GameOptionInternal.SUBUNIT_PREFERENCE, value: subunitPreference }]);
    }

    /** @returns the current subunit preference option value */
    getSubunitPreference(): SubunitsPreference {
        return this.gameOptions.subunitPreference;
    }

    /** Resets the subunit preference option to the default value */
    async resetSubunitPreference() {
        await this.setSubunitPreference(DEFAULT_SUBUNIT_PREFERENCE);
    }

    /**
     * Sets the OST preference option value
     * @param ostPreference - The OstPreference
     */
    async setOstPreference(ostPreference: OstPreference) {
        this.gameOptions.ostPreference = ostPreference;
        await this.updateGuildPreferences([{ name: GameOptionInternal.OST_PREFERENCE, value: ostPreference }]);
    }

    /** @returns the current OST preference option value */
    getOstPreference(): OstPreference {
        return this.gameOptions.ostPreference;
    }

    /** Resets the OST preference option to the default value */
    async resetOstPreference() {
        await this.setOstPreference(DEFAULT_OST_PREFERENCE);
    }

    /**
     * Sets the mode type option value
     * @param guessModeType - The GuessModeType
     */
    async setGuessModeType(guessModeType: GuessModeType) {
        this.gameOptions.guessModeType = guessModeType;
        await this.updateGuildPreferences([{ name: GameOptionInternal.GUESS_MODE_TYPE, value: guessModeType }]);
    }

    /** @returns the current mode type option value */
    getGuessModeType(): GuessModeType {
        return this.gameOptions.guessModeType;
    }

    /** Resets the mode type option to the default value */
    async resetGuessModeType() {
        await this.setGuessModeType(DEFAULT_GUESS_MODE);
    }

    /**
     * Sets the release type option value
     * @param releaseType - The ReleaseType
     */
    async setReleaseType(releaseType: ReleaseType) {
        this.gameOptions.releaseType = releaseType;
        await this.updateGuildPreferences([{ name: GameOptionInternal.RELEASE_TYPE, value: releaseType }]);
    }

    /** @returns the current release type option value */
    getReleaseType(): ReleaseType {
        return this.gameOptions.releaseType;
    }

    /** Resets the release type option to the default value */
    async resetReleaseType() {
        await this.setReleaseType(DEFAULT_RELEASE_TYPE);
    }

    /**
     * Sets the goal option value
     * @param goal - The goal option
     */
    async setGoal(goal: number) {
        this.gameOptions.goal = goal;
        await this.updateGuildPreferences([{ name: GameOptionInternal.GOAL, value: goal }]);
    }

    /** @returns the current goal option value */
    getGoal(): number {
        return this.gameOptions.goal;
    }

    /** Resets the goal option to the default value */
    async resetGoal() {
        await this.setGoal(null);
    }

    /** @returns whether the goal option is set */
    isGoalSet(): boolean {
        return this.gameOptions.goal !== null;
    }

    /**
     * Sets the duration option value
     * @param duration - The game session duration in minutes
     */
    async setDuration(duration: number) {
        this.gameOptions.duration = duration;
        await this.updateGuildPreferences([{ name: GameOptionInternal.DURATION, value: duration }]);
    }

    /** @returns the current duration option value */
    getDuration(): number {
        return this.gameOptions.duration;
    }

    /** Resets the duration option to the default value */
    async resetDuration() {
        await this.setDuration(null);
    }

    /** @returns whether the duratiopn option is active */
    isDurationSet(): boolean {
        return this.gameOptions.duration !== null;
    }

    /**
     * Sets the timer option value
     * @param guessTimeout - The timer option
     */
    async setGuessTimeout(guessTimeout: number) {
        this.gameOptions.guessTimeout = guessTimeout;
        await this.updateGuildPreferences([{ name: GameOptionInternal.GUESS_TIMEOUT, value: guessTimeout }]);
    }

    /** @returns the current timer option value */
    getGuessTimeout(): number {
        return this.gameOptions.guessTimeout;
    }

    /** Resets the timer option to the default value */
    async resetGuessTimeout() {
        await this.setGuessTimeout(null);
    }

    /** @returns whether the timer option is active */
    isGuessTimeoutSet(): boolean {
        return this.gameOptions.guessTimeout !== null;
    }

    /**
     * Sets the shuffle type option value
     * @param shuffleType - The shuffle type
     */
    async setShuffleType(shuffleType: ShuffleType) {
        this.gameOptions.shuffleType = shuffleType;

        // Doesn't actually modify list of available_songs, but we need to
        // reset lastPlayedSongsQueue when changing shuffling modes
        await this.updateGuildPreferences([{ name: GameOptionInternal.SHUFFLE_TYPE, value: shuffleType }]);
    }

    /** Returns the current shuffle type option value */
    getShuffleType(): ShuffleType {
        return this.gameOptions.shuffleType;
    }

    /** Resets the shuffle type to the default value */
    async resetShuffleType() {
        await this.setShuffleType(DEFAULT_SHUFFLE);
    }

    /** @returns whether the current shuffle type is UNIQUE */
    isShuffleUnique(): boolean {
        return this.gameOptions.shuffleType === ShuffleType.UNIQUE;
    }

    /**
     * Sets the language type option value
     * @param languageType - The language type
     */
    async setLanguageType(languageType: LanguageType) {
        this.gameOptions.languageType = languageType;
        await this.updateGuildPreferences([{ name: GameOptionInternal.LANGUAGE_TYPE, value: languageType }]);
    }

    /** @returns the langauge type option value */
    getLanguageType(): LanguageType {
        return this.gameOptions.languageType;
    }

    /** Resets the language type option the the default value */
    async resetLanguageType() {
        await this.setLanguageType(DEFAULT_LANGUAGE);
    }

    /**
     * Sets the multiguess type option value
     * @param multiGuessType - The multiguess type
     */
    async setMultiGuessType(multiGuessType: MultiGuessType) {
        this.gameOptions.multiGuessType = multiGuessType;
        await this.updateGuildPreferences([{ name: GameOptionInternal.MULTI_GUESS_TYPE, value: multiGuessType }]);
    }

    /** @returns the multiguess type option value */
    getMultiGuessType(): MultiGuessType {
        return this.gameOptions.multiGuessType;
    }

    /** Resets the multiguess type option the the default value */
    async resetMultiGuessType() {
        await this.setMultiGuessType(DEFAULT_MULTIGUESS_TYPE);
    }

    /**
     * Persists the current guild preference to the data store
     * @param updatedOptionsObjects - An array of objects containing the names and values of updated options
     */
    async updateGuildPreferences(updatedOptionsObjects: Array<{ name: string, value: GameOptionValue }>) {
        const updatedOptions = Object.values(updatedOptionsObjects).map((option) => ({
            guild_id: this.guildID,
            option_name: option.name,
            option_value: JSON.stringify(option.value),
        }));
        await dbContext.kmq.transaction(async (trx) => {
            await dbContext.kmq("game_options")
                .insert(updatedOptions)
                .onConflict(["guild_id", "option_name"])
                .merge()
                .transacting(trx);
        });
        const gameSession = state.gameSessions[this.guildID];
        if (gameSession) {
            await gameSession.updateFilteredSongs(this);
        }
    }

    /** Resets all options to the default value */
    async resetToDefault() {
        this.gameOptions = { ...GuildPreference.DEFAULT_OPTIONS };
        const options = Object.entries(this.gameOptions).map((x) => {
            const optionName = x[0];
            const optionValue = x[1];
            return { name: optionName, value: optionValue };
        });
        await this.updateGuildPreferences(options);
    }
}
