import * as uuid from "uuid";
import {
    DEFAULT_ADVANCED_SETTINGS,
    DEFAULT_ANSWER_TYPE,
    DEFAULT_ARTIST_TYPE,
    DEFAULT_BEGINNING_SEARCH_YEAR,
    DEFAULT_ENDING_SEARCH_YEAR,
    DEFAULT_GENDER,
    DEFAULT_GUESS_MODE,
    DEFAULT_LANGUAGE,
    DEFAULT_LIMIT,
    DEFAULT_MULTIGUESS_TYPE,
    DEFAULT_OST_PREFERENCE,
    DEFAULT_RELEASE_TYPE,
    DEFAULT_SEEK,
    DEFAULT_SHUFFLE,
    DEFAULT_SUBUNIT_PREFERENCE,
    GameOptionInternal,
    NON_RELOAD_IMPACTING_GAME_OPTION_INTERNALS,
} from "../constants";
import { IPCLogger } from "../logger";
import { Mutex } from "async-mutex";
import { mapTo } from "../helpers/utils";
import AdvancedCommandActionName from "../enums/advanced_setting_action_name";
import AnswerType from "../enums/option_types/answer_type";
import EnvType from "../enums/env_type";
import GameOption from "../enums/game_option_name";
import Session from "./session";
import SongSelector from "./song_selector";
import _ from "lodash";
import dbContext from "../database_context";
import type { AdvancedSettings } from "../types";
import type { GameOptions as GameOptionsSchema } from "../typings/kmq_db";
import type { GenderModeOptions } from "../enums/option_types/gender";
import type { Insertable } from "kysely";
import type { MutexInterface } from "async-mutex";
import type AdvancedCommandAction from "../enums/advanced_setting_action_name";
import type ArtistType from "../enums/option_types/artist_type";
import type GameOptions from "../interfaces/game_options";
import type GuessModeType from "../enums/option_types/guess_mode_type";
import type LanguageType from "../enums/option_types/language_type";
import type MatchedArtist from "../interfaces/matched_artist";
import type MultiGuessType from "../enums/option_types/multiguess_type";
import type OstPreference from "../enums/option_types/ost_preference";
import type ReleaseType from "../enums/option_types/release_type";
import type SeekType from "../enums/option_types/seek_type";
import type ShuffleType from "../enums/option_types/shuffle_type";
import type SpecialType from "../enums/option_types/special_type";
import type SubunitsPreference from "../enums/option_types/subunit_preference";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const logger = new IPCLogger("guild_preference");

type GameOptionValue =
    | number
    | Array<GenderModeOptions>
    | SeekType
    | SpecialType
    | GuessModeType
    | ReleaseType
    | ArtistType
    | AnswerType
    | ShuffleType
    | AdvancedSettings
    | MatchedArtist[]
    | LanguageType
    | MultiGuessType
    | SubunitsPreference
    | OstPreference
    | string
    | null;

/**
 * @param groups - The artists to combine into a string
 * @param truncate - Whether to truncuate the final result
 * @param spaceDelimiter - Whether to space delimit the final result
 * @returns the truncated string
 */
function getGroupNamesString(
    groups: MatchedArtist[],
    truncate = true,
    spaceDelimiter = true,
): string {
    let displayedGroupNames = groups
        .filter((groups) => groups.addedByUser == true)
        .map((x) => x.name)
        .join(spaceDelimiter ? ", " : ",");

    if (truncate && displayedGroupNames.length > 200) {
        displayedGroupNames = `${displayedGroupNames.substring(
            0,
            200,
        )} and many others...`;
    }

    return displayedGroupNames;
}

export default class GuildPreference {
    resetArgs: {
        [gameOption in GameOption]?: {
            default: Array<any>;
            setter:
                | ((...args: any) => Promise<void>)
                | ((...args: any) => void);
        };
    } = {
        [GameOption.LIMIT]: {
            default: [0, DEFAULT_LIMIT],
            setter: this.setLimit,
        },
        [GameOption.GROUPS]: { default: [null], setter: this.setGroups },
        [GameOption.EXCLUDE]: { default: [null], setter: this.setExcludes },
        [GameOption.INCLUDE]: { default: [null], setter: this.setIncludes },
        [GameOption.GENDER]: {
            default: [DEFAULT_GENDER],
            setter: this.setGender,
        },
        [GameOption.SEEK_TYPE]: {
            default: [DEFAULT_SEEK],
            setter: this.setSeekType,
        },
        [GameOption.SPECIAL_TYPE]: {
            default: [null],
            setter: this.setSpecialType,
        },
        [GameOption.ARTIST_TYPE]: {
            default: [DEFAULT_ARTIST_TYPE],
            setter: this.setArtistType,
        },
        [GameOption.ANSWER_TYPE]: {
            default: [DEFAULT_ANSWER_TYPE],
            setter: this.setAnswerType,
        },
        [GameOption.SUBUNIT_PREFERENCE]: {
            default: [DEFAULT_SUBUNIT_PREFERENCE],
            setter: this.setSubunitPreference,
        },
        [GameOption.OST_PREFERENCE]: {
            default: [DEFAULT_OST_PREFERENCE],
            setter: this.setOstPreference,
        },
        [GameOption.GUESS_MODE_TYPE]: {
            default: [DEFAULT_GUESS_MODE],
            setter: this.setGuessModeType,
        },
        [GameOption.RELEASE_TYPE]: {
            default: [DEFAULT_RELEASE_TYPE],
            setter: this.setReleaseType,
        },
        [GameOption.GOAL]: { default: [null], setter: this.setGoal },
        [GameOption.DURATION]: { default: [null], setter: this.setDuration },
        [GameOption.TIMER]: { default: [null], setter: this.setGuessTimeout },
        [GameOption.SHUFFLE_TYPE]: {
            default: [DEFAULT_SHUFFLE],
            setter: this.setShuffleType,
        },
        [GameOption.LANGUAGE_TYPE]: {
            default: [DEFAULT_LANGUAGE],
            setter: this.setLanguageType,
        },
        [GameOption.MULTIGUESS]: {
            default: [DEFAULT_MULTIGUESS_TYPE],
            setter: this.setMultiGuessType,
        },
        [GameOption.FORCE_PLAY_SONG]: {
            default: [null],
            setter: this.setForcePlaySong,
        },
        [GameOption.PLAYLIST_ID]: {
            default: [null],
            setter: this.setKmqPlaylistID,
        },
    };

    static DEFAULT_OPTIONS: GameOptions = {
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
        advancedSettings: DEFAULT_ADVANCED_SETTINGS,
        artistType: DEFAULT_ARTIST_TYPE,
        answerType: DEFAULT_ANSWER_TYPE,
        languageType: DEFAULT_LANGUAGE,
        multiGuessType: DEFAULT_MULTIGUESS_TYPE,
        subunitPreference: DEFAULT_SUBUNIT_PREFERENCE,
        ostPreference: DEFAULT_OST_PREFERENCE,
        forcePlaySongID: null,
        spotifyPlaylistID: null,
    };

    /** The GuildPreference's respective GameOptions */
    public gameOptions: GameOptions;

    /** The Discord Guild ID */
    public readonly guildID: string;

    /** The song selector */
    public readonly songSelector: SongSelector;

    /** Callback to send song messages */
    public answerTypeChangeCallback: (() => Promise<void>) | undefined;

    /** The guild preference cache */
    private static guildPreferencesCache: {
        [guildID: string]: GuildPreference;
    } = {};

    /** Locks for generating GuildPreference */
    private static locks: Map<string, MutexInterface> = new Map();

    constructor(guildID: string, options?: GameOptions) {
        this.guildID = guildID;
        this.gameOptions =
            options || _.cloneDeep(GuildPreference.DEFAULT_OPTIONS);
        this.songSelector = new SongSelector(this);
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this.validateGameOptions();
    }

    async validateGameOptions(): Promise<void> {
        const validatedGameOptions = { ...this.gameOptions };
        let newDefaultOptionsAdded = 0;
        // apply default game option for empty
        for (const defaultOption in GuildPreference.DEFAULT_OPTIONS) {
            if (!(defaultOption in validatedGameOptions)) {
                mapTo(
                    validatedGameOptions,
                    GuildPreference.DEFAULT_OPTIONS,
                    defaultOption as keyof typeof validatedGameOptions,
                );

                newDefaultOptionsAdded++;
            }
        }

        this.gameOptions = validatedGameOptions;

        if (newDefaultOptionsAdded && process.env.NODE_ENV !== EnvType.TEST) {
            logger.info(
                `gid: ${this.guildID} | validateGameOptions: options modified during validation (+${newDefaultOptionsAdded})`,
            );
            await this.updateGuildPreferences();
        }
    }

    static async getGuildPreference(guildID: string): Promise<GuildPreference> {
        if (!(guildID in this.locks)) {
            this.locks.set(guildID, new Mutex());
        }

        return this.locks.get(guildID)!.runExclusive(async () => {
            const cachedGuildPreference =
                GuildPreference.guildPreferencesCache[guildID];

            if (cachedGuildPreference) {
                return cachedGuildPreference;
            }

            const guildPreferences = await dbContext.kmq
                .selectFrom("guilds")
                .select("guild_id")
                .where("guild_id", "=", guildID)
                .executeTakeFirst();

            if (!guildPreferences) {
                const guildPreference = GuildPreference.fromGuild(guildID);
                await dbContext.kmq
                    .insertInto("guilds")
                    .values({ guild_id: guildID, join_date: new Date() })
                    .execute();
                return guildPreference;
            }

            const gameOptionPairs = (
                await dbContext.kmq
                    .selectFrom("game_options")
                    .select(["option_name", "option_value"])
                    .where("guild_id", "=", guildID)
                    .where(
                        "client_id",
                        "=",
                        process.env.BOT_CLIENT_ID as string,
                    )
                    .execute()
            )
                .map((x) => ({
                    [x["option_name"]]: JSON.parse(x["option_value"] as string),
                }))
                .reduce((total, curr) => Object.assign(total, curr), {});

            const guildPreference = GuildPreference.fromGuild(
                guildPreferences.guild_id,
                gameOptionPairs,
            );

            GuildPreference.guildPreferencesCache[guildID] = guildPreference;
            return guildPreference;
        });
    }

    /**
     * Constructs a GuildPreference from a JSON payload
     * @param guildID - The guild ID
     * @param gameOptionsJson - the JSON object representing the stored GameOption
     * @returns a new GuildPreference object
     */
    static fromGuild(
        guildID: string,
        gameOptionsJson?: Object,
    ): GuildPreference {
        if (!gameOptionsJson) {
            return new GuildPreference(
                guildID,
                _.cloneDeep(GuildPreference.DEFAULT_OPTIONS),
            );
        }

        return new GuildPreference(guildID, gameOptionsJson as GameOptions);
    }

    /** @returns a list of saved game option presets by name */
    async listPresets(): Promise<string[]> {
        const presets = (
            await dbContext.kmq
                .selectFrom("game_option_presets")
                .select(["preset_name"])
                .where("guild_id", "=", this.guildID)
                .distinct()
                .execute()
        ).map((x) => x["preset_name"]);

        return presets;
    }

    /**
     * @param presetName - The game preset to be deleted
     * @returns the old UUID if the deletion was successful and null otherwise
     */
    async deletePreset(presetName: string): Promise<string | null> {
        const presetUUID = await this.getPresetUUID(presetName);

        if (!presetUUID) {
            return null;
        }

        await dbContext.kmq
            .deleteFrom("game_option_presets")
            .where("guild_id", "=", this.guildID)
            .where("preset_name", "=", presetName)
            .execute();

        return presetUUID;
    }

    /**
     * @param presetName - The name of the preset to be saved
     * @param oldUUID - The UUID of a previous preset with the same name (in case of replacement)
     * @returns whether the preset was saved
     */
    async savePreset(
        presetName: string,
        oldUUID: string | null,
    ): Promise<boolean> {
        try {
            const presetOptions = Object.entries(this.gameOptions).map(
                (option) => ({
                    guild_id: this.guildID,
                    preset_name: presetName,
                    option_name: option[0],
                    option_value: JSON.stringify(option[1]),
                }),
            );

            presetOptions.push({
                guild_id: this.guildID,
                preset_name: presetName,
                option_name: "uuid",
                option_value: JSON.stringify(oldUUID ?? `KMQ-${uuid.v4()}`),
            });

            await dbContext.kmq.transaction().execute(async (trx) => {
                await trx
                    .insertInto("game_option_presets")
                    .values(presetOptions)
                    .execute();
            });
            return true;
        } catch (e) {
            return false;
        }
    }

    /**
     * @param presetName - The name of the preset to be loaded
     * @param guildID - The guildID of the guild containing presetName
     * @returns whether the preset was loaded
     */
    async loadPreset(
        presetName: string,
        guildID: string,
    ): Promise<[boolean, Array<GameOption>]> {
        const preset: { [x: string]: any } = (
            await dbContext.kmq
                .selectFrom("game_option_presets")
                .select(["option_name", "option_value"])
                .where("guild_id", "=", guildID)
                .where("preset_name", "=", presetName)
                .execute()
        )
            .map((x) => ({
                [x["option_name"]]: JSON.parse(x["option_value"] as string),
            }))
            .reduce((total, curr) => Object.assign(total, curr), {});

        if (Object.keys(preset).length === 0) {
            return [false, []];
        }

        const oldOptions = this.gameOptions;
        this.gameOptions = preset as GameOptions;
        await this.validateGameOptions();
        const updatedOptions = Object.entries(this.gameOptions).filter(
            (option) =>
                !_.isEqual(
                    oldOptions[option[0] as keyof typeof oldOptions],
                    option[1],
                ),
        );

        if (updatedOptions.length === 0) {
            // User loads a preset with the exact same options as what is currently set
            return [true, []];
        }

        const updatedOptionsObj: Array<{
            name: GameOptionInternal;
            value: GameOptionValue;
        }> = updatedOptions.map((x) => {
            const optionName = x[0] as GameOptionInternal;
            const optionValue = x[1];
            return { name: optionName, value: optionValue };
        });

        await this.updateGuildPreferences(updatedOptionsObj);
        return [true, updatedOptions.map((x) => x[0] as GameOption)];
    }

    /**
     * @param presetName - The name of the preset whose UUID is requested
     * @returns whether the UUID of the given preset or null if the preset doesn't exist
     */
    async getPresetUUID(presetName: string): Promise<string | null> {
        const presetID = await dbContext.kmq
            .selectFrom("game_option_presets")
            .select(["option_value"])
            .where("guild_id", "=", this.guildID)
            .where("preset_name", "=", presetName)
            .where("option_name", "=", "uuid")
            .executeTakeFirst();

        if (!presetID) {
            return null;
        }

        return JSON.parse(presetID["option_value"] as string);
    }

    /**
     * Sets the limit option value
     * @param limitStart - The limit range start
     * @param limitEnd - The limit range end
     */
    async setLimit(limitStart: number, limitEnd: number): Promise<void> {
        this.gameOptions.limitStart = limitStart;
        this.gameOptions.limitEnd = limitEnd;
        await this.updateGuildPreferences([
            { name: GameOptionInternal.LIMIT_START, value: limitStart },
            { name: GameOptionInternal.LIMIT_END, value: limitEnd },
        ]);
    }

    async reset(gameOption: GameOption): Promise<void> {
        if (gameOption in this.resetArgs) {
            const resetArg = this.resetArgs[gameOption];
            if (resetArg) {
                await resetArg.setter.bind(this)(...resetArg.default);
            }
        }
    }

    /**
     * Sets the beginning cutoff year option value
     * @param year - The beginning cutoff year
     */
    async setBeginningCutoffYear(year: number): Promise<void> {
        this.gameOptions.beginningYear = year;
        await this.updateGuildPreferences([
            { name: GameOptionInternal.BEGINNING_YEAR, value: year },
        ]);
    }

    /**
     * Sets the end cutoff year option value
     * @param year - The end cutoff year
     */
    async setEndCutoffYear(year: number): Promise<void> {
        this.gameOptions.endYear = year;
        await this.updateGuildPreferences([
            { name: GameOptionInternal.END_YEAR, value: year },
        ]);
    }

    /** @returns whether the group option is active */
    isGroupsMode(): boolean {
        return this.getGroupIDs().length !== 0;
    }

    /**
     * Sets the groups option value
     * @param groups - A list of MatchedArtist
     */
    async setGroups(groups: MatchedArtist[]): Promise<void> {
        this.gameOptions.groups = groups;
        await this.updateGuildPreferences([
            { name: GameOptionInternal.GROUPS, value: groups },
        ]);
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

    /**
     * @returns a friendly, potentially truncated, string displaying the currently selected groups option
     * */
    getDisplayedGroupNames(): string | null {
        if (this.gameOptions.groups === null) return null;
        return getGroupNamesString(this.gameOptions.groups);
    }

    /** @returns whether the exclude option is active */
    isExcludesMode(): boolean {
        return this.getExcludesGroupIDs().length !== 0;
    }

    /**
     * Sets the exclude option value
     * @param groups - A list of kpop groups (ID and name)
     */
    async setExcludes(groups: MatchedArtist[]): Promise<void> {
        this.gameOptions.excludes = groups;
        await this.updateGuildPreferences([
            { name: GameOptionInternal.EXCLUDES, value: groups },
        ]);
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

    /**
     * @returns a friendly, potentially truncated, string displaying the currently selected exclude option
     * */
    getDisplayedExcludesGroupNames(): string | null {
        if (this.gameOptions.excludes === null) return null;
        return getGroupNamesString(this.gameOptions.excludes);
    }

    /** @returns whether the exclude option is active */
    isIncludesMode(): boolean {
        return this.getIncludesGroupIDs().length !== 0;
    }

    /**
     * Sets the include option value
     * @param groups - A list of MatchedArtist
     */
    async setIncludes(groups: MatchedArtist[]): Promise<void> {
        this.gameOptions.includes = groups;
        await this.updateGuildPreferences([
            { name: GameOptionInternal.INCLUDES, value: groups },
        ]);
    }

    /** @returns a list containing the excluded group IDs */
    getIncludesGroupIDs(): number[] {
        if (this.gameOptions.includes === null) return [];
        return this.gameOptions.includes.map((x) => x.id);
    }

    /**
     * @returns a friendly, potentially truncated, string displaying the currently selected include option
     * */
    getDisplayedIncludesGroupNames(): string | null {
        if (this.gameOptions.includes === null) return null;
        return getGroupNamesString(this.gameOptions.includes);
    }

    /**
     * Sets the gender option value
     * @param genderArr - A list of GENDER enums
     */
    async setGender(genderArr: Array<GenderModeOptions>): Promise<void> {
        this.gameOptions.gender = [...new Set(genderArr)];
        await this.updateGuildPreferences([
            { name: GameOptionInternal.GENDER, value: this.gameOptions.gender },
        ]);
    }

    /** @returns whether gender is set to alternating */
    isGenderAlternating(): boolean {
        return this.gameOptions.gender[0] === "alternating";
    }

    /**
     * Sets the seek type option value
     * @param seekType - The SeekType
     */
    async setSeekType(seekType: SeekType): Promise<void> {
        this.gameOptions.seekType = seekType;
        await this.updateGuildPreferences([
            { name: GameOptionInternal.SEEK_TYPE, value: seekType },
        ]);
    }

    /**
     * Sets the special type option value
     * @param specialType - The SpecialType
     */
    async setSpecialType(specialType: SpecialType | null): Promise<void> {
        this.gameOptions.specialType = specialType;
        await this.updateGuildPreferences([
            { name: GameOptionInternal.SPECIAL_TYPE, value: specialType },
        ]);
    }

    /**
     * Sets the artist type option value
     * @param artistType - The ArtistType
     */
    async setArtistType(artistType: ArtistType): Promise<void> {
        this.gameOptions.artistType = artistType;
        await this.updateGuildPreferences([
            { name: GameOptionInternal.ARTIST_TYPE, value: artistType },
        ]);
    }

    /**
     * Sets the answer type option value
     * @param answerType - The AnswerType
     */
    async setAnswerType(answerType: AnswerType): Promise<void> {
        this.gameOptions.answerType = answerType;
        await this.updateGuildPreferences([
            { name: GameOptionInternal.ANSWER_TYPE, value: answerType },
        ]);
    }

    /**
     * @returns whether typos are allowed
     */
    typosAllowed(): boolean {
        return this.gameOptions.answerType === AnswerType.TYPING_TYPOS;
    }

    /** @returns if multiple choice mode is active */
    isMultipleChoiceMode(): boolean {
        return [
            AnswerType.MULTIPLE_CHOICE_EASY,
            AnswerType.MULTIPLE_CHOICE_MED,
            AnswerType.MULTIPLE_CHOICE_HARD,
        ].includes(this.gameOptions.answerType);
    }

    /** @returns if hidden is active */
    isHiddenMode(): boolean {
        return this.gameOptions.answerType === AnswerType.HIDDEN;
    }

    /**
     * Sets the subunit preference option value
     * @param subunitPreference - The SubunitsPreference
     */
    async setSubunitPreference(
        subunitPreference: SubunitsPreference,
    ): Promise<void> {
        this.gameOptions.subunitPreference = subunitPreference;
        await this.updateGuildPreferences([
            {
                name: GameOptionInternal.SUBUNIT_PREFERENCE,
                value: subunitPreference,
            },
        ]);
    }

    /**
     * Sets the OST preference option value
     * @param ostPreference - The OstPreference
     */
    async setOstPreference(ostPreference: OstPreference): Promise<void> {
        this.gameOptions.ostPreference = ostPreference;
        await this.updateGuildPreferences([
            { name: GameOptionInternal.OST_PREFERENCE, value: ostPreference },
        ]);
    }

    /**
     * Sets the mode type option value
     * @param guessModeType - The GuessModeType
     */
    async setGuessModeType(guessModeType: GuessModeType): Promise<void> {
        this.gameOptions.guessModeType = guessModeType;
        await this.updateGuildPreferences([
            { name: GameOptionInternal.GUESS_MODE_TYPE, value: guessModeType },
        ]);
    }

    /**
     * Sets the release type option value
     * @param releaseType - The ReleaseType
     */
    async setReleaseType(releaseType: ReleaseType): Promise<void> {
        this.gameOptions.releaseType = releaseType;
        await this.updateGuildPreferences([
            { name: GameOptionInternal.RELEASE_TYPE, value: releaseType },
        ]);
    }

    /**
     * Sets the goal option value
     * @param goal - The goal option
     */
    async setGoal(goal: number | null): Promise<void> {
        this.gameOptions.goal = goal;
        await this.updateGuildPreferences([
            { name: GameOptionInternal.GOAL, value: goal },
        ]);
    }

    /** @returns whether the goal option is set */
    isGoalSet(): this is GuildPreference & { gameOptions: { goal: number } } {
        return this.gameOptions.goal !== null;
    }

    /**
     * Sets the advanced settings value
     * @param settingName - The advanced setting's name
     * @param settingValue - The setting's vlaue
     */
    async updateAdvancedSetting(
        settingName: AdvancedCommandAction,
        settingValue: number,
    ): Promise<void> {
        this.gameOptions.advancedSettings[settingName] = settingValue;
        await this.updateGuildPreferences([
            {
                name: GameOptionInternal.ADVANCED_SETTINGS,
                value: this.gameOptions.advancedSettings,
            },
        ]);
    }

    /**
     * Resets the advanced settings
     */
    async resetAdvancedSettings(): Promise<void> {
        this.gameOptions.advancedSettings = {
            ...DEFAULT_ADVANCED_SETTINGS,
        };

        await this.updateGuildPreferences([
            {
                name: GameOptionInternal.ADVANCED_SETTINGS,
                value: this.gameOptions.advancedSettings,
            },
        ]);
    }

    /** @returns whether the goal option is set */
    getMultiGuessDelay(): number {
        return this.gameOptions.advancedSettings[
            AdvancedCommandActionName.MULTIGUESS_DELAY
        ];
    }

    /** @returns whether the goal option is set */
    getSongStartDelay(): number {
        return this.gameOptions.advancedSettings[
            AdvancedCommandActionName.SONG_START_DELAY
        ];
    }

    /**
     * Sets the duration option value
     * @param duration - The game session duration in minutes
     */
    async setDuration(duration: number): Promise<void> {
        this.gameOptions.duration = duration;
        await this.updateGuildPreferences([
            { name: GameOptionInternal.DURATION, value: duration },
        ]);
    }

    /** @returns whether the duratiopn option is active */
    isDurationSet(): this is GuildPreference & {
        gameOptions: { duration: number };
    } {
        return this.gameOptions.duration !== null;
    }

    /**
     * Sets the timer option value
     * @param guessTimeout - The timer option
     */
    async setGuessTimeout(guessTimeout: number | null): Promise<void> {
        this.gameOptions.guessTimeout = guessTimeout;
        await this.updateGuildPreferences([
            { name: GameOptionInternal.GUESS_TIMEOUT, value: guessTimeout },
        ]);
    }

    /** @returns whether the timer option is active */
    isGuessTimeoutSet(): this is GuildPreference & {
        gameOptions: { guessTimeout: number };
    } {
        return this.gameOptions.guessTimeout !== null;
    }

    /**
     * Sets the shuffle type option value
     * @param shuffleType - The shuffle type
     */
    async setShuffleType(shuffleType: ShuffleType): Promise<void> {
        this.gameOptions.shuffleType = shuffleType;
        await this.updateGuildPreferences([
            { name: GameOptionInternal.SHUFFLE_TYPE, value: shuffleType },
        ]);
    }

    /**
     * Sets the language type option value
     * @param languageType - The language type
     */
    async setLanguageType(languageType: LanguageType): Promise<void> {
        this.gameOptions.languageType = languageType;
        await this.updateGuildPreferences([
            { name: GameOptionInternal.LANGUAGE_TYPE, value: languageType },
        ]);
    }

    /**
     * Sets the multiguess type option value
     * @param multiGuessType - The multiguess type
     */
    async setMultiGuessType(multiGuessType: MultiGuessType): Promise<void> {
        this.gameOptions.multiGuessType = multiGuessType;
        await this.updateGuildPreferences([
            {
                name: GameOptionInternal.MULTI_GUESS_TYPE,
                value: multiGuessType,
            },
        ]);
    }

    /**
     * Sets the force play song option value
     * @param forcePlaySongID - The force played song's ID
     */
    async setForcePlaySong(forcePlaySongID: string): Promise<void> {
        this.gameOptions.forcePlaySongID = forcePlaySongID;
        await this.updateGuildPreferences([
            {
                name: GameOptionInternal.FORCE_PLAY_SONG,
                value: forcePlaySongID,
            },
        ]);
    }

    /**
     * Sets the playlist option value
     * @param kmqPlaylistIdentifier -  KMQ playlist ID
     */
    async setKmqPlaylistID(
        kmqPlaylistIdentifier: string | null,
    ): Promise<void> {
        this.gameOptions.spotifyPlaylistID = kmqPlaylistIdentifier;
        await this.updateGuildPreferences([
            {
                name: GameOptionInternal.PLAYLIST_ID,
                value: kmqPlaylistIdentifier,
            },
        ]);
    }

    /** @returns the ID of the playlist to retrieve songs from */
    getKmqPlaylistID(): string | null {
        return this.gameOptions.spotifyPlaylistID;
    }

    /**
     * @returns whether the playing option is set
     */
    isPlaylist(): boolean {
        return this.gameOptions.spotifyPlaylistID !== null;
    }

    /**
     * Persists the current guild preference to the data store
     * @param updatedOptionsObjects - An array of objects containing the names and values of updated options
     */
    async updateGuildPreferences(
        updatedOptionsObjects?: Array<{
            name: GameOptionInternal;
            value: GameOptionValue;
        }>,
    ): Promise<void> {
        let updatedOptions: Insertable<GameOptionsSchema>[] = [];
        if (updatedOptionsObjects) {
            updatedOptions = Object.values(updatedOptionsObjects).map(
                (option) => ({
                    guild_id: this.guildID,
                    client_id: process.env.BOT_CLIENT_ID as string,
                    option_name: option.name,
                    option_value: JSON.stringify(option.value),
                    last_updated: new Date(),
                }),
            );
        } else {
            updatedOptions = Object.entries(this.gameOptions).map((x) => {
                const optionName = x[0];
                const optionValue = x[1];
                return {
                    guild_id: this.guildID,
                    client_id: process.env.BOT_CLIENT_ID as string,
                    option_name: optionName,
                    option_value: JSON.stringify(optionValue),
                    last_updated: new Date(),
                };
            });
        }

        updatedOptions = updatedOptions.sort((a, b) =>
            a.option_name.localeCompare(b.option_name),
        );

        await dbContext.kmq.transaction().execute(async (trx) => {
            const inserts = updatedOptions.map((x) =>
                trx
                    .insertInto("game_options")
                    .values(x)
                    .onDuplicateKeyUpdate(x),
            );

            for (const insert of inserts) {
                // eslint-disable-next-line no-await-in-loop
                await insert.execute();
            }
        });

        const gameOptionsAreReloadImpacting = !updatedOptions.every((option) =>
            NON_RELOAD_IMPACTING_GAME_OPTION_INTERNALS.includes(
                option.option_name as GameOptionInternal,
            ),
        );

        if (gameOptionsAreReloadImpacting) {
            logger.info(
                `gid: ${this.guildID} | Impactful game options modified, songs reloaded`,
            );

            await this.songSelector.reloadSongs();
        }

        if (this.answerTypeChangeCallback) {
            if (
                updatedOptionsObjects
                    ?.map((x) => x.name)
                    .includes(GameOptionInternal.ANSWER_TYPE)
            ) {
                await this.answerTypeChangeCallback();
            }
        }
    }

    /** Resets all options to the default value */
    async resetToDefault(): Promise<Array<GameOption>> {
        const oldOptions = this.gameOptions;
        this.gameOptions = _.cloneDeep(GuildPreference.DEFAULT_OPTIONS);

        // do not reset answerType
        this.gameOptions["answerType"] = oldOptions.answerType;

        const session = Session.getSession(this.guildID);
        if (session && session.isGameSession()) {
            if (session.isHiddenMode()) {
                // do not reset timer if hidden (a timer must always be set)
                this.gameOptions["guessTimeout"] = oldOptions.guessTimeout;
            }
        }

        const options: Array<{
            name: GameOptionInternal;
            value: GameOptionValue;
        }> = Object.entries(this.gameOptions).map((x) => {
            const optionName = x[0] as GameOptionInternal;
            const optionValue = x[1];
            return { name: optionName, value: optionValue };
        });

        await this.updateGuildPreferences(options);

        const updatedOptions = Object.entries(this.gameOptions).filter(
            (option) =>
                !_.isEqual(
                    oldOptions[option[0] as keyof typeof oldOptions],
                    option[1],
                ),
        );

        return _.uniq(updatedOptions.map((x) => x[0] as GameOption));
    }
}
