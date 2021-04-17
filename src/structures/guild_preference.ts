import { DEFAULT_BEGINNING_SEARCH_YEAR, DEFAULT_ENDING_SEARCH_YEAR } from "../commands/game_options/cutoff";
import { DEFAULT_LIMIT } from "../commands/game_options/limit";
import { Gender, DEFAULT_GENDER } from "../commands/game_options/gender";
import { SeekType, DEFAULT_SEEK } from "../commands/game_options/seek";
import { ShuffleType, DEFAULT_SHUFFLE } from "../commands/game_options/shuffle";
import { ModeType, DEFAULT_MODE } from "../commands/game_options/mode";
import _logger from "../logger";
import dbContext from "../database_context";
import { ArtistType, DEFAULT_ARTIST_TYPE } from "../commands/game_options/artisttype";
import { DEFAULT_LANGUAGE, LanguageType } from "../commands/game_options/language";
import { DEFAULT_SUBUNIT_PREFERENCE, SubunitsPreference } from "../commands/game_options/subunits";
import { MatchedArtist } from "../types";
import { DEFAULT_OST_PREFERENCE, OstPreference } from "../commands/game_options/ost";
import { DEFAULT_RELEASE_TYPE, ReleaseType } from "../commands/game_options/release";
import { DEFAULT_MULTIGUESS_TYPE, MultiGuessType } from "../commands/game_options/multiguess";
import state from "../kmq";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const logger = _logger("guild_preference");

interface GameOptions {
    beginningYear: number;
    endYear: number;
    gender: Array<Gender>;
    limitStart: number;
    limitEnd: number;
    seekType: SeekType;
    modeType: ModeType;
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
        modeType: DEFAULT_MODE,
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
     * @param json - the JSON object representing the stored GameOption
     * @returns a new GuildPreference object
     */
    static fromGuild(guildID: string, json?: GuildPreference): GuildPreference {
        if (!json) {
            return new GuildPreference(guildID, { ...GuildPreference.DEFAULT_OPTIONS });
        }
        const gameOptions = this.validateGameOptions(json.gameOptions);

        const guildPreference = new GuildPreference(guildID, gameOptions);
        guildPreference.updateGuildPreferences(false);

        return guildPreference;
    }

    /** @returns a list of saved game option presets by name */
    async listPresets(): Promise<string[]> {
        const presets = (await dbContext.kmq("game_option_presets")
            .select(["preset_name"])
            .where("guild_id", "=", this.guildID))
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
            await dbContext.kmq("game_option_presets")
                .insert({
                    guild_id: this.guildID,
                    preset_name: presetName,
                    game_options: JSON.stringify(this.gameOptions),
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
        const preset = await dbContext.kmq("game_option_presets")
            .select(["game_options"])
            .where("guild_id", "=", this.guildID)
            .andWhere("preset_name", "=", presetName)
            .first();

        if (!preset) {
            return false;
        }
        this.gameOptions = GuildPreference.validateGameOptions(JSON.parse(preset["game_options"]));
        await this.updateGuildPreferences(true);
        return true;
    }

    /**
     * Sets the limit option value
     * @param limit - The limit range value
     */
    async setLimit(limitStart: number, limitEnd: number) {
        this.gameOptions.limitEnd = limitEnd;
        this.gameOptions.limitStart = limitStart;
        await this.updateGuildPreferences(true);
    }

    /** Resets the limit option to the default value */
    async resetLimit() {
        this.gameOptions.limitEnd = DEFAULT_LIMIT;
        this.gameOptions.limitStart = 0;
        await this.updateGuildPreferences(true);
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
        await this.updateGuildPreferences(true);
    }

    /** Resets the beginning cutoff year option to the default value */
    async resetBeginningCutoffYear() {
        this.gameOptions.beginningYear = DEFAULT_BEGINNING_SEARCH_YEAR;
        await this.updateGuildPreferences(true);
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
        await this.updateGuildPreferences(true);
    }

    /** Resets the end cutoff year option to the default value */
    async resetEndCutoffYear() {
        this.gameOptions.endYear = DEFAULT_ENDING_SEARCH_YEAR;
        await this.updateGuildPreferences(true);
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
     * @param groupIDs - A list of kpop groups, ID and name
     */
    async setGroups(groupIDs: MatchedArtist[]) {
        this.gameOptions.groups = groupIDs;
        await this.updateGuildPreferences(true);
    }

    /** Resets the groups option to the default value */
    async resetGroups() {
        this.gameOptions.groups = null;
        await this.updateGuildPreferences(true);
    }

    /** @returns the current selected groups, if the groups option is active */
    getGroupIDs(): number[] {
        if (this.gameOptions.groups === null) return [];
        return this.gameOptions.groups.map((x) => x.id);
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
     * @param groupIDs - A list of kpop groups, ID and name
     */
    async setExcludes(groupIDs: MatchedArtist[]) {
        this.gameOptions.excludes = groupIDs;
        await this.updateGuildPreferences(true);
    }

    /** Resets the exclude option to the default value */
    async resetExcludes() {
        this.gameOptions.excludes = null;
        await this.updateGuildPreferences(true);
    }

    /** @returns a list containing the excluded group IDs */
    getExcludesGroupIDs(): number[] {
        if (this.gameOptions.excludes === null) return [];
        return this.gameOptions.excludes.map((x) => x.id);
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
     * @param groupIDs - A list of kpop groups, ID and name
     */
    async setIncludes(groupIDs: MatchedArtist[]) {
        this.gameOptions.includes = groupIDs;
        await this.updateGuildPreferences(true);
    }

    /** Resets the include option to the default value */
    async resetIncludes() {
        this.gameOptions.includes = null;
        await this.updateGuildPreferences(true);
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
        this.gameOptions.gender = DEFAULT_GENDER;
        await this.updateGuildPreferences(true);
    }

    /**
     * Sets the gender option value
     * @param genderArr - A list of GENDER enums
     */
    async setGender(genderArr: Array<Gender>) {
        this.gameOptions.gender = [...new Set(genderArr)];
        await this.updateGuildPreferences(true);
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
        await this.updateGuildPreferences(true);
    }

    /** Gets the current seek type option value */
    getSeekType(): SeekType {
        return this.gameOptions.seekType;
    }

    /** Resets the seek type option to the default value */
    async resetSeekType() {
        this.gameOptions.seekType = DEFAULT_SEEK;
        await this.updateGuildPreferences(true);
    }

    /** @returns the current artist type option value */
    getArtistType(): ArtistType {
        return this.gameOptions.artistType;
    }

    /** Resets the artist type option to the default value */
    async resetArtistType() {
        this.gameOptions.artistType = DEFAULT_ARTIST_TYPE;
        await this.updateGuildPreferences(true);
    }

    /**
     * Sets the artist type option value
     * @param artistType - The ArtistType
     */
    async setArtistType(artistType: ArtistType) {
        this.gameOptions.artistType = artistType as ArtistType;
        await this.updateGuildPreferences(true);
    }

    /**
     * Sets the subunit preference option value
     * @param subunitPreference - The SubunitsPreference
     */
    async setSubunitPreference(subunitPreference: SubunitsPreference) {
        this.gameOptions.subunitPreference = subunitPreference as SubunitsPreference;
        await this.updateGuildPreferences(true);
    }

    /** @returns the current subunit preference option value */
    getSubunitPreference(): SubunitsPreference {
        return this.gameOptions.subunitPreference;
    }

    /** Resets the subunit preference option to the default value */
    async resetSubunitPreference() {
        this.gameOptions.subunitPreference = DEFAULT_SUBUNIT_PREFERENCE;
        await this.updateGuildPreferences(true);
    }

    /**
     * Sets the OST preference option value
     * @param ostPreference - The OstPreference
     */
    async setOstPreference(ostPreference: OstPreference) {
        this.gameOptions.ostPreference = ostPreference as OstPreference;
        await this.updateGuildPreferences(true);
    }

    /** @returns the current OST preference option value */
    getOstPreference(): OstPreference {
        return this.gameOptions.ostPreference;
    }

    /** Resets the OST preference option to the default value */
    async resetOstPreference() {
        this.gameOptions.ostPreference = DEFAULT_OST_PREFERENCE;
        await this.updateGuildPreferences(true);
    }

    /**
     * Sets the mode type option value
     * @param modeType - The ModeType
     */
    async setModeType(modeType: ModeType) {
        this.gameOptions.modeType = modeType as ModeType;
        await this.updateGuildPreferences(true);
    }

    /** @returns the current mode type option value */
    getModeType(): ModeType {
        return this.gameOptions.modeType;
    }

    /** Resets the mode type option to the default value */
    async resetModeType() {
        this.gameOptions.modeType = DEFAULT_MODE;
        await this.updateGuildPreferences(true);
    }

    /**
     * Sets the release type option value
     * @param releaseType - The ReleaseType
     */
    async setReleaseType(releaseType: ReleaseType) {
        this.gameOptions.releaseType = releaseType as ReleaseType;
        await this.updateGuildPreferences(true);
    }

    /** @returns the current release type option value */
    getReleaseType(): ReleaseType {
        return this.gameOptions.releaseType;
    }

    /** Resets the release type option to the default value */
    async resetReleaseType() {
        this.gameOptions.modeType = DEFAULT_MODE;
        await this.updateGuildPreferences(true);
    }

    /**
     * Sets the goal option value
     * @param goal - The goal option
     */
    async setGoal(goal: number) {
        this.gameOptions.goal = goal;
        await this.updateGuildPreferences(true);
    }

    /** @returns the current goal option value */
    getGoal(): number {
        return this.gameOptions.goal;
    }

    /** Resets the goal option to the default value */
    async resetGoal() {
        this.gameOptions.goal = null;
        await this.updateGuildPreferences(true);
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
        await this.updateGuildPreferences(true);
    }

    /** @returns the current duration option value */
    getDuration(): number {
        return this.gameOptions.duration;
    }

    /** Resets the duration option to the default value */
    async resetDuration() {
        this.gameOptions.duration = null;
        await this.updateGuildPreferences(true);
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
        await this.updateGuildPreferences(true);
    }

    /** @returns the current timer option value */
    getGuessTimeout(): number {
        return this.gameOptions.guessTimeout;
    }

    /** Resets the timer option to the default value */
    async resetGuessTimeout() {
        this.gameOptions.guessTimeout = null;
        await this.updateGuildPreferences(true);
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
        await this.updateGuildPreferences(true);
    }

    /** Returns the current shuffle type option value */
    getShuffleType(): ShuffleType {
        return this.gameOptions.shuffleType;
    }

    /** Resets the shuffle type to the default value */
    async resetShuffleType() {
        this.gameOptions.shuffleType = DEFAULT_SHUFFLE;
        await this.updateGuildPreferences(true);
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
        await this.updateGuildPreferences(true);
    }

    /** @returns the langauge type option value */
    getLanguageType(): LanguageType {
        return this.gameOptions.languageType;
    }

    /** Resets the language type option the the default value */
    async resetLanguageType() {
        this.gameOptions.languageType = DEFAULT_LANGUAGE;
        await this.updateGuildPreferences(true);
    }

    /**
     * Sets the multiguess type option value
     * @param multiGuessType - The multiguess type
     */
    async setMultiGuessType(multiGuessType: MultiGuessType) {
        this.gameOptions.multiGuessType = multiGuessType;
        await this.updateGuildPreferences(true);
    }

    /** @returns the multiguess type option value */
    getMultiGuessType(): MultiGuessType {
        return this.gameOptions.multiGuessType;
    }

    /** Resets the multiguess type option the the default value */
    async resetMultiGuessType() {
        this.gameOptions.multiGuessType = DEFAULT_MULTIGUESS_TYPE;
        await this.updateGuildPreferences(true);
    }

    /**
     * Persists the current guild preference to the data store
     */
    async updateGuildPreferences(updateGameSession: boolean) {
        await dbContext.kmq("guild_preferences")
            .where({ guild_id: this.guildID })
            .update({ guild_preference: JSON.stringify(this) });
        const gameSession = state.gameSessions[this.guildID];
        if (gameSession && updateGameSession) {
            await gameSession.updateSongCount(this);
        }
    }

    /** Resets all options to the default value */
    async resetToDefault() {
        this.gameOptions = { ...GuildPreference.DEFAULT_OPTIONS };
        await this.updateGuildPreferences(true);
    }
}
