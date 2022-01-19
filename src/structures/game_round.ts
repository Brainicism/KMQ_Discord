import _ from "lodash";
import Eris from "eris";
import levenshtien from "damerau-levenshtein";
import { GuessModeType } from "../commands/game_options/guessmode";
import { state } from "../kmq_worker";
import KmqMember from "./kmq_member";
import {
    ExpBonusModifier,
    ExpBonusModifierValues,
} from "../commands/game_commands/exp";
/** List of characters to remove from song/artist names/guesses */
// eslint-disable-next-line no-useless-escape
const REMOVED_CHARACTERS = /[\|’\ '?!.\-,:;★*´\(\)\+\u200B]/g;
/** Set of characters to replace in song names/guesses */
const CHARACTER_REPLACEMENTS = [
    { pattern: REMOVED_CHARACTERS, replacement: "" },
    { pattern: /&/g, replacement: "and" },
];

export interface GuessCorrectness {
    exact: boolean;
    similar: boolean;
}

/**
 * Takes in a song name and removes the characters in the predefined list
 * @param name - the song name
 * @returns The cleaned song name
 */
export function cleanSongName(name: string): string {
    let cleanName = name.toLowerCase();
    for (const characterReplacement of CHARACTER_REPLACEMENTS) {
        cleanName = cleanName.replace(
            characterReplacement.pattern,
            characterReplacement.replacement
        );
    }

    return cleanName;
}

/**
 * Takes in an artist name and removes the characters in the predefined list
 * @param name - the artist name
 * @returns The cleaned artist name
 */
export function cleanArtistName(name: string): string {
    let cleanName = name.toLowerCase().trim();

    for (const characterReplacement of CHARACTER_REPLACEMENTS) {
        cleanName = cleanName.replace(
            characterReplacement.pattern,
            characterReplacement.replacement
        );
    }

    return cleanName;
}

/**
 * @param name - the name of the song/artist
 * @returns The hint for the round
 * */
function generateHint(name: string): string {
    const HIDDEN_CHARACTER_PERCENTAGE = 0.75;
    const nameLength = name.length;
    const eligibleCharacterIndicesToHide = _.range(0, nameLength).filter(
        (x) => !name[x].match(REMOVED_CHARACTERS)
    );

    const hideMask = _.sampleSize(
        eligibleCharacterIndicesToHide,
        Math.max(
            Math.floor(
                eligibleCharacterIndicesToHide.length *
                    HIDDEN_CHARACTER_PERCENTAGE
            ),
            1
        )
    );

    const hiddenName = name
        .split("")
        .map((char, idx) => {
            if (hideMask.includes(idx)) return "_";
            return char;
        })
        .join(" ");

    return hiddenName;
}

export default class GameRound {
    /** The song name with brackets removed */
    public readonly songName: string;

    /** The original song name */
    public readonly originalSongName: string;

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

    /** The song publish date on YouTube */
    public readonly publishDate: Date;

    /** The song's views on YouTube */
    public readonly views: number;

    /** Round bonus modifier */
    public bonusModifier: number;

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
    public readonly hints: { songHint: string; artistHint: string };

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

    constructor(
        cleanedSongName: string,
        originalSongName: string,
        artist: string,
        videoID: string,
        publishDate: Date,
        views: number
    ) {
        this.songName = cleanedSongName;
        this.originalSongName = originalSongName;
        this.songAliases = state.aliases.song[videoID] || [];
        this.acceptedSongAnswers = [cleanedSongName, ...this.songAliases];
        const artistNames = artist.split("+").map((x) => x.trim());
        this.artistAliases = artistNames.flatMap(
            (x) => state.aliases.artist[x] || []
        );
        this.acceptedArtistAnswers = [...artistNames, ...this.artistAliases];
        this.artistName = artist;
        this.videoID = videoID;
        this.skipAchieved = false;
        this.startedAt = Date.now();
        this.publishDate = publishDate;
        this.views = views;
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
        this.bonusModifier =
            Math.random() < 0.01
                ? _.sample([
                      ExpBonusModifierValues[
                          ExpBonusModifier.RANDOM_GUESS_BONUS_COMMON
                      ],
                      ExpBonusModifierValues[
                          ExpBonusModifier.RANDOM_GUESS_BONUS_RARE
                      ],
                      ExpBonusModifierValues[
                          ExpBonusModifier.RANDOM_GUESS_BONUS_EPIC
                      ],
                      ExpBonusModifierValues[
                          ExpBonusModifier.RANDOM_GUESS_BONUS_LEGENDARY
                      ],
                  ])
                : 1;
    }

    /**
     * Adds a skip vote for the specified user
     * @param userID - the Discord user ID of the player skipping
     */
    userSkipped(userID: string): void {
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
     * Adds a hint vote for the specified user
     * @param userID - the Discord user ID of the player requesting a hint
     */
    hintRequested(userID: string): void {
        this.hintRequesters.add(userID);
    }

    /**
     * Gets the number of players who have requested a hint
     * @returns the number of hint requesters
     */
    getHintRequests(): number {
        return this.hintRequesters.size;
    }

    /**
     * Marks a user as having guessed correctly
     * @param userID - The user ID of the correct guesser
     * @param pointsAwarded - The number of points awarded to the correct guesser
     */
    userCorrect(userID: string, pointsAwarded: number): void {
        if (!this.correctGuessers.some((x) => x.id === userID)) {
            this.correctGuessers.push(
                KmqMember.fromUser(
                    state.client.users.get(userID),
                    pointsAwarded
                )
            );
        }
    }

    getExpReward(typosAllowed = false): number {
        let exp = this.baseExp;
        if (this.hintUsed) {
            exp *= ExpBonusModifierValues[ExpBonusModifier.HINT_USED];
        }

        if (typosAllowed) {
            exp *= ExpBonusModifierValues[ExpBonusModifier.TYPO];
        }

        return exp;
    }

    /**
     * Checks whether a user's guess is correct given a guesing mode type
     * @param guess - The user's guess
     * @param guessModeType - The guessing mode
     * @param typosAllowed - Whether to allow minor typos
     * @returns the number of points as defined by the mode type and correctness of the guess
     */
    checkGuess(
        guess: string,
        guessModeType: GuessModeType,
        typosAllowed = false
    ): number {
        let pointReward = 0;

        const songGuessResult = this.checkSongGuess(guess);
        const artistGuessResult = this.checkArtistGuess(guess);
        const isSongGuessCorrect =
            songGuessResult.exact || (typosAllowed && songGuessResult.similar);

        const isArtistGuessCorrect =
            artistGuessResult.exact ||
            (typosAllowed && artistGuessResult.similar);

        if (guessModeType === GuessModeType.SONG_NAME) {
            pointReward = isSongGuessCorrect ? 1 : 0;
        } else if (guessModeType === GuessModeType.ARTIST) {
            pointReward = isArtistGuessCorrect ? 1 : 0;
        } else if (guessModeType === GuessModeType.BOTH) {
            if (isSongGuessCorrect) pointReward = 1;
            if (isArtistGuessCorrect) pointReward = 0.2;
        }

        return this.hintUsed ? pointReward / 2 : pointReward;
    }

    /**
     * Sets the base exp
     * @param baseExp - The base exp
     */
    setBaseExpReward(baseExp: number): void {
        this.baseExp = baseExp;
    }

    /**
     * @param correctGuesses - The number of correct guesses
     * Marks button guesses as correct or incorrect in a multiple choice game
     */
    async interactionMarkAnswers(correctGuesses: number): Promise<void> {
        if (!this.interactionMessage) return;
        await this.interactionMessage.edit({
            embeds: this.interactionMessage.embeds,
            components: this.interactionComponents.map((x) => ({
                type: 1,
                components: x.components.map((y) => {
                    const z = y as Eris.InteractionButton;
                    const noGuesses =
                        this.interactionIncorrectAnswerUUIDs[z.custom_id] === 0;

                    let label = z.label;
                    let style: 1 | 3 | 4;
                    if (this.interactionCorrectAnswerUUID === z.custom_id) {
                        if (correctGuesses) {
                            label += ` (${correctGuesses})`;
                        }

                        style = 3;
                    } else if (noGuesses) {
                        style = 1;
                    } else {
                        label += ` (${
                            this.interactionIncorrectAnswerUUIDs[z.custom_id]
                        })`;
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
     * @param interactionUUID - the UUID of an interaction
     * @returns true if the given UUID is one of the guesses of the current game round
     */
    isValidInteractionGuess(interactionUUID: string): boolean {
        return (
            interactionUUID === this.interactionCorrectAnswerUUID ||
            Object.keys(this.interactionIncorrectAnswerUUIDs).includes(
                interactionUUID
            )
        );
    }

    /**
     * @param interactionUUID - the UUID of an interaction
     * @returns true if the given UUID is associated with the interaction corresponding to
     * the correct guess
     */
    isCorrectInteractionAnswer(interactionUUID: string): boolean {
        return this.interactionCorrectAnswerUUID === interactionUUID;
    }

    isBonusArtist(): boolean {
        return state.bonusArtists.has(this.artistName);
    }

    /**
     * @param guess - The guessed string
     * @param correctChoices - The correct choices to check against
     * @returns whether the guess complies with the similarity requirements
     */
    static similarityCheck(
        guess: string,
        correctChoices: Array<string>
    ): boolean {
        const distanceRequired = (length: number): number => {
            if (length <= 4) return -1;
            if (length <= 6) return 1;
            return 2;
        };

        return correctChoices.some((x) => {
            if (Math.abs(guess.length - x.length) < 2) {
                const distance = levenshtien(guess, x);
                if (distance.steps <= distanceRequired(x.length)) {
                    return true;
                }
            }

            return false;
        });
    }

    /**
     * Checks whether the song guess matches the GameRound's song
     * @param message - The Message that contains the guess
     * @returns whether or not the guess was correct
     */
    private checkSongGuess(message: string): GuessCorrectness {
        const guess = cleanSongName(message);
        const cleanedSongAliases = this.acceptedSongAnswers.map((x) =>
            cleanSongName(x)
        );

        return {
            exact: this.songName && cleanedSongAliases.includes(guess),
            similar: GameRound.similarityCheck(guess, cleanedSongAliases),
        };
    }

    /**
     * Checks whether the artist guess matches the GameRound's aritst
     * @param message - The Message that contains the guess
     * @returns whether or not the guess was correct
     */
    private checkArtistGuess(message: string): GuessCorrectness {
        const guess = cleanArtistName(message);
        const cleanedArtistAliases = this.acceptedArtistAnswers.map((x) =>
            cleanArtistName(x)
        );

        return {
            exact: this.songName && cleanedArtistAliases.includes(guess),
            similar: GameRound.similarityCheck(guess, cleanedArtistAliases),
        };
    }
}
