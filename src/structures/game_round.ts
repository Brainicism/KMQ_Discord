import _ from "lodash";
import Eris from "eris";
import { GuessModeType } from "../commands/game_options/guessmode";
import { state } from "../kmq";
import KmqMember from "./kmq_member";
/** List of characters to remove from song/artist names/guesses */
// eslint-disable-next-line no-useless-escape
const REMOVED_CHARACTERS = /[\|’\ '?!.\-,:;★*´\ \(\)\+\u200B]/g;

/** Set of characters to replace in song names/guesses */
const CHARACTER_REPLACEMENTS = [
    { pattern: REMOVED_CHARACTERS, replacement: "" },
    { pattern: /&/g, replacement: "and" },
];

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

/** Generate the round hints */
function generateHint(name: string): string {
    const HIDDEN_CHARACTER_PERCENTAGE = 0.75;
    name = name.toLowerCase().split("(")[0];
    const nameLength = name.length;
    const eligibleCharacterIndicesToHide = _.range(0, nameLength).filter((x) => !name[x].match(REMOVED_CHARACTERS));
    const hideMask = _.sampleSize(eligibleCharacterIndicesToHide, Math.max(Math.floor(eligibleCharacterIndicesToHide.length * HIDDEN_CHARACTER_PERCENTAGE), 1));
    const hiddenName = name.split("").map((char, idx) => {
        if (hideMask.includes(idx)) return "_";
        return char;
    }).join(" ");

    return hiddenName;
}

export default class GameRound {
    /** The song name */
    public readonly songName: string;

    /** The potential song aliases */
    public readonly songAliases: string[];

    /** The artist name */
    public readonly artistName: string;

    /** The potential artist aliases */
    public readonly artistAliases: string[];

    /** The youtube video ID of the current song */
    public readonly videoID: string;

    /** Timestamp of the creation of the GameRound in epoch milliseconds */
    public readonly startedAt: number;

    /** The song release year */
    public readonly songYear: number;

    /** List of players who have opted to skip the current GameRound */
    public skippers: Set<string>;

    /** List of players who requested a hint */
    public hintRequesters: Set<string>;

    /** Whether a hint was used */
    public hintUsed: boolean;

    /** List of players who guessed correctly */
    public readonly correctGuessers: Array<KmqMember>;

    /** Whether the GameRound has been skipped */
    public skipAchieved: boolean;

    /** Timestamp of the last time the GameRound was interacted with in epoch milliseconds */
    public lastActive: number;

    /**  Whether the song has been guessed yet */
    public finished: boolean;

    /** The accepted answers for the song name */
    public readonly acceptedSongAnswers: Array<string>;

    /** The accepted answers for the artist name */
    public readonly acceptedArtistAnswers: Array<string>;

    /** Song/artist name hints */
    public readonly hints: { songHint: string, artistHint: string };

    /** UUID associated with right guess interaction custom_id */
    public interactionCorrectAnswerUUID: string;

    /** UUID associated with wrong guesses in multiple choice */
    public interactionIncorrectAnswerUUIDs: { [uuid: string]: number };

    /** List of players who incorrectly guessed in the multiple choice */
    public incorrectMCGuessers: Set<string>;

    /** List of players who incorrectly guessed in the multiple choice */
    public interactionComponents: Array<Eris.ActionRow>;

    /** List of players who incorrectly guessed in the multiple choice */
    public interactionMessage: Eris.Message<Eris.TextableChannel>;

    /** The base EXP for this GameRound */
    private baseExp: number;

    constructor(song: string, artist: string, videoID: string, year: number) {
        this.songName = song;
        this.songAliases = state.aliases.song[videoID] || [];
        this.acceptedSongAnswers = [song, ...this.songAliases];
        const artistNames = artist.split("+").map((x) => x.trim());
        this.artistAliases = artistNames.flatMap((x) => state.aliases.artist[x] || []);
        this.acceptedArtistAnswers = [...artistNames, ...this.artistAliases];
        this.artistName = artist;
        this.videoID = videoID;
        this.skipAchieved = false;
        this.startedAt = Date.now();
        this.songYear = year;
        this.skippers = new Set();
        this.hintUsed = false;
        this.hintRequesters = new Set();
        this.correctGuessers = [];
        this.finished = false;
        this.hints = {
            songHint: generateHint(this.songName),
            artistHint: generateHint(this.artistName),
        };
        this.interactionCorrectAnswerUUID = null;
        this.interactionIncorrectAnswerUUIDs = {};
        this.incorrectMCGuessers = new Set();
        this.interactionComponents = [];
        this.interactionMessage = null;
    }

    /**
     * Adds a skip vote for the specified user
     * @param userID - the Discord user ID of the player skipping
     */
    userSkipped(userID: string) {
        this.skippers.add(userID);
    }

    /**
     * Gets the number of players who have opted to skip the GameRound
     * @returns the number of skippers
     */
    getNumSkippers(): number {
        return this.skippers.size;
    }

    /**
     * Adds a skip vote for the specified user
     * @param userID - the Discord user ID of the player skipping
     */
    hintRequested(userID: string) {
        this.hintRequesters.add(userID);
    }

    /**
     * Gets the number of players who have opted to skip the GameRound
     * @returns the number of skippers
     */
    getHintRequests(): number {
        return this.hintRequesters.size;
    }

    /**
     * Marks a user as having guessed correctly
     * @param userID - The user ID of the correct guesser
     */
    userCorrect(userID: string, pointsAwarded: number) {
        if (!this.correctGuessers.some((x) => x.id === userID)) {
            this.correctGuessers.push(KmqMember.fromUser(state.client.users.get(userID), pointsAwarded));
        }
    }

    getExpReward(): number {
        return this.hintUsed ? this.baseExp / 2 : this.baseExp;
    }

    /**
     * Checks whether a user's guess is correct given a guesing mode type
     * @param message - The Message that contains the guess
     * @param guessModeType - The guessing mode
     * @returns the number of points as defined by the mode type and correctness of the guess
     */
    checkGuess(guess: string, guessModeType: GuessModeType): number {
        let pointReward = 0;
        if (guessModeType === GuessModeType.SONG_NAME) {
            pointReward = this.checkSongGuess(guess) ? 1 : 0;
        } else if (guessModeType === GuessModeType.ARTIST) {
            pointReward = this.checkArtistGuess(guess) ? 1 : 0;
        } else if (guessModeType === GuessModeType.BOTH) {
            if (this.checkSongGuess(guess)) pointReward = 1;
            if (this.checkArtistGuess(guess)) pointReward = 0.2;
        }

        return this.hintUsed ? pointReward / 2 : pointReward;
    }

    /**
     * Sets the base exp
     * @param baseExp - The base exp
     */
    setBaseExpReward(baseExp: number) {
        this.baseExp = baseExp;
    }

    /**
     * Marks button guesses as correct or incorrect in a multiple choice game
     */
    async interactionMarkAnswers(correctGuesses: number) {
        if (!this.interactionMessage) return;
        await this.interactionMessage.edit({
            components: this.interactionComponents.map((x) => ({
                type: 1,
                components: x.components.map((y) => {
                    const z = y as Eris.InteractionButton;
                    const noGuesses = this.interactionIncorrectAnswerUUIDs[z.custom_id] === 0;
                    let label = z.label;
                    let style: 2 | 1 | 4 | 3;
                    if (this.interactionCorrectAnswerUUID === z.custom_id) {
                        if (correctGuesses) {
                            label += ` (${correctGuesses})`;
                        }

                        style = 3;
                    } else if (noGuesses) {
                        style = 1;
                    } else {
                        label += ` (${this.interactionIncorrectAnswerUUIDs[z.custom_id]})`;
                        style = 4;
                    }

                    return {
                        label,
                        custom_id: z.custom_id,
                        style,
                        type: 2,
                        disabled: true,
                    };
                }),
            })),
        });
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
