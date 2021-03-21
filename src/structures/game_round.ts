import { ModeType } from "../commands/game_options/mode";
import state from "../kmq";
import _logger from "../logger";

/** List of characters to remove from song/artist names/guesses */
// eslint-disable-next-line no-useless-escape
const REMOVED_CHARACTERS = /[\|’\ '?!.\-,:;★\ \(\)\+]/g;

/** Set of characters to replace in song names/guesses */
const CHARACTER_REPLACEMENTS = [
    { pattern: REMOVED_CHARACTERS, replacement: "" },
    { pattern: /&/g, replacement: "and" },
];

const logger = _logger("game_round");

/**
 * Takes in a song name and removes the characters in the predefined list
 * @param name - the song name
 * @returns The cleaned song name
 */
export function cleanSongName(name: string): string {
    let cleanName = name.toLowerCase()
        .split("(")[0]
        .trim();
    for (const characterReplacement of CHARACTER_REPLACEMENTS) {
        cleanName = cleanName.replace(characterReplacement.pattern, characterReplacement.replacement);
    }
    return cleanName;
}

/**
 * Takes in an artist name and removes the characters in the predefined list
 * @param name - the artist name
 * @returns The cleaned artist name
 */
export function cleanArtistName(name: string): string {
    let cleanName = name.toLowerCase()
        .trim();
    for (const characterReplacement of CHARACTER_REPLACEMENTS) {
        cleanName = cleanName.replace(characterReplacement.pattern, characterReplacement.replacement);
    }
    return cleanName;
}

export default class GameRound {
    /** The song name */
    public readonly songName: string;

    /** The accepted answers for the song name */
    public readonly acceptedSongAnswers: Array<string>;

    /** The artist name */
    public readonly artist: string;

    /** The accepted answers for the artist name */
    public readonly acceptedArtistAnswers: Array<string>;

    /** The youtube video ID of the current song */
    public readonly videoID: string;

    /** Timestamp of the creation of the GameRound in epoch milliseconds */
    public readonly startedAt: number;

    /** The song release year */
    public readonly songYear: number;

    /** List of players who have opted to skip the current GameRound */
    public skippers: Set<string>;

    /** Whether the GameRound has been skipped */
    public skipAchieved: boolean;

    /** Timestamp of the last time the GameRound was interacted with in epoch milliseconds */
    public lastActive: number;

    /** The base EXP for this GameRound */
    public baseExp: number;

    constructor(song: string, artist: string, videoID: string, year: number) {
        this.songName = song;
        this.acceptedSongAnswers = [song, ...(state.aliases.song[videoID] || [])];
        const artistNames = artist.split("+").map((x) => x.trim());
        const artistAliases = artistNames.flatMap((x) => [x, ...(state.aliases.artist[x] || [])]);
        this.acceptedArtistAnswers = artistAliases;
        this.artist = artist;
        this.videoID = videoID;
        this.skipAchieved = false;
        this.startedAt = Date.now();
        this.songYear = year;
        this.skippers = new Set();
    }

    /**
     * Adds a skip vote for the specified user
     * @param userId - the Discord user ID of the player skipping
     */
    userSkipped(userId: string) {
        this.skippers.add(userId);
    }

    /**
     * Gets the number of players who have opted to skip the GameRound
     * @returns the number of skippers
     */
    getNumSkippers(): number {
        return this.skippers.size;
    }

    /**
     * Checks whether a user's guess is correct given a guesing mode type
     * @param message - The Message that contains the guess
     * @param modeType - The guessing mode
     * @returns the number of points as defined by the mode type and correctness of the guess
     */
    checkGuess(guess: string, modeType: ModeType): number {
        if (modeType === ModeType.SONG_NAME) {
            return this.checkSongGuess(guess) ? 1 : 0;
        }
        if (modeType === ModeType.ARTIST) {
            return this.checkArtistGuess(guess) ? 1 : 0;
        }
        if (modeType === ModeType.BOTH) {
            if (this.checkSongGuess(guess)) return 1;
            if (this.checkArtistGuess(guess)) return 0.2;
            return 0;
        }
        logger.error(`Illegal mode type: ${modeType}`);
        return 0;
    }

    /**
     * Sets the base exp
     * @param baseExp - The base exp
     */
    setBaseExpReward(baseExp: number) {
        this.baseExp = baseExp;
    }

    /**
     * Checks whether the song guess matches the GameRound's song
     * @param message - The Message that contains the guess
     * @returns whether or not the guess was correct
     */
    private checkSongGuess(message: string): boolean {
        const guess = cleanSongName(message);
        const cleanedSongAliases = this.acceptedSongAnswers.map((x) => cleanSongName(x));
        return this.songName && cleanedSongAliases.includes(guess);
    }

    /**
     * Checks whether the artist guess matches the GameRound's aritst
     * @param message - The Message that contains the guess
     * @returns whether or not the guess was correct
     */
    private checkArtistGuess(message: string): boolean {
        const guess = cleanArtistName(message);
        const cleanedArtistAliases = this.acceptedArtistAnswers.map((x) => cleanArtistName(x));
        return this.songName && cleanedArtistAliases.includes(guess);
    }
}
