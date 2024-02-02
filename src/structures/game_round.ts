import {
    CORRECT_GUESS_EMOJI,
    EMBED_ERROR_COLOR,
    EMBED_SUCCESS_BONUS_COLOR,
    EMBED_SUCCESS_COLOR,
    ExpBonusModifierValues,
    INCORRECT_GUESS_EMOJI,
    QUICK_GUESS_EMOJI,
    QUICK_GUESS_MS,
    ROUND_MAX_RUNNERS_UP,
} from "../constants";
import { IPCLogger } from "../logger";
import { friendlyFormattedNumber, getMention } from "../helpers/utils";
import ExpBonusModifier from "../enums/exp_bonus_modifier";
import GameType from "../enums/game_type";
import GuessModeType from "../enums/option_types/guess_mode_type";
import KmqMember from "./kmq_member";
import LocaleType from "../enums/locale_type";
import Round from "./round";
import State from "../state";
import _ from "lodash";
import i18n from "../helpers/localization_manager";
import levenshtien from "damerau-levenshtein";
import type Eris from "eris";
import type MessageContext from "./message_context";
import type PlayerRoundResult from "../interfaces/player_round_result";
import type QueriedSong from "../interfaces/queried_song";
import type UniqueSongCounter from "../interfaces/unique_song_counter";
/** List of characters to remove from song/artist names/guesses */
// eslint-disable-next-line no-useless-escape
const REMOVED_CHARACTERS = /[\|’\ '?!.\-,:;★*´\(\)\+\u200B…]/g;
/** Set of characters to replace in song names/guesses */
const CHARACTER_REPLACEMENTS = [
    { pattern: REMOVED_CHARACTERS, replacement: "" },
    { pattern: /&/g, replacement: "and" },
];

const MAX_DISPLAYED_GUESS_LENGTH = 50;

const logger = new IPCLogger("game_round");

interface GuessCorrectness {
    exact: boolean;
    similar: boolean;
}

type GuessResult = {
    timeToGuessMs: number;
    guess: string;
    correct: boolean;
};

type PlayerToGuesses = {
    [playerID: string]: Array<GuessResult>;
};

/**
 * Takes in a song name and removes the characters in the predefined list
 * @param name - the song name
 * @returns The cleaned song name
 */
export function normalizePunctuationInName(name: string): string {
    let cleanName = name.toLowerCase();
    for (const characterReplacement of CHARACTER_REPLACEMENTS) {
        cleanName = cleanName.replace(
            characterReplacement.pattern,
            characterReplacement.replacement,
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
            characterReplacement.replacement,
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
        (x) => !name[x].match(REMOVED_CHARACTERS),
    );

    const hideMask = _.sampleSize(
        eligibleCharacterIndicesToHide,
        Math.max(
            Math.floor(
                eligibleCharacterIndicesToHide.length *
                    HIDDEN_CHARACTER_PERCENTAGE,
            ),
            1,
        ),
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

export default class GameRound extends Round {
    /** Round bonus modifier */
    public bonusModifier: number;

    /** List of players who requested a hint */
    public hintRequesters: Set<string>;

    /** Whether a hint was used */
    public hintUsed: boolean;

    /** List of players who guessed correctly */
    public readonly correctGuessers: Array<KmqMember>;

    /** The accepted answers for the song name */
    public readonly acceptedSongAnswers: Array<string>;

    /** The accepted answers for the artist name */
    public readonly acceptedArtistAnswers: Array<string>;

    /** Song/artist name hints */
    public readonly hints: {
        songHint: {
            [LocaleType.EN]: string;
            [LocaleType.KO]: string;
        };
        artistHint: {
            [LocaleType.EN]: string;
            [LocaleType.KO]: string;
        };
    };

    /** UUID associated with right guess interaction custom_id */
    public interactionCorrectAnswerUUID: string | null;

    /** UUID associated with wrong guesses in multiple choice */
    public interactionIncorrectAnswerUUIDs: { [uuid: string]: number };

    /** List of players who incorrectly guessed in the multiple choice */
    public incorrectGuessers: Set<string>;

    /** Info about the players that won this GameRound */
    public playerRoundResults: Array<PlayerRoundResult>;

    /** Let players know their guess would have been accepted if they were using /answer typingtypos */
    public warnTypoReceived: boolean;

    /** The base EXP for this GameRound */
    private baseExp: number;

    /** Each player's guess */
    private guesses: PlayerToGuesses;

    constructor(song: QueriedSong, baseExp: number) {
        super(song);
        this.acceptedSongAnswers = [song.songName, ...this.songAliases];
        if (song.hangulSongName) {
            this.acceptedSongAnswers.push(song.hangulSongName);
        }

        const artistNames = song.artistName.split("+").map((x) => x.trim());
        if (song.hangulArtistName) {
            artistNames.push(
                ...song.hangulArtistName.split("+").map((x) => x.trim()),
            );
        }

        this.acceptedArtistAnswers = [
            ...artistNames.flatMap((x) =>
                this.extractBracketedComponentsFromName(x),
            ),
            ...this.artistAliases,
        ];

        this.baseExp = baseExp;
        this.hintUsed = false;
        this.hintRequesters = new Set();
        this.correctGuessers = [];
        this.finished = false;
        this.hints = {
            songHint: {
                [LocaleType.EN]: generateHint(song.songName),
                [LocaleType.KO]: generateHint(
                    song.hangulSongName || song.songName,
                ),
            },
            artistHint: {
                [LocaleType.EN]: generateHint(song.artistName),
                [LocaleType.KO]: generateHint(
                    song.hangulArtistName || song.artistName,
                ),
            },
        };
        this.interactionCorrectAnswerUUID = null;
        this.interactionIncorrectAnswerUUIDs = {};
        this.incorrectGuessers = new Set();
        this.interactionMessage = null;
        this.playerRoundResults = [];
        this.warnTypoReceived = false;
        this.bonusModifier =
            Math.random() < 0.01
                ? (_.sample([
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
                  ]) as number)
                : 1;
        this.guesses = {};
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
        typosAllowed = false,
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
     * Returns true if the guess is similar to the song/artist name
     * @param guess - The user's guess
     * @param guessModeType - The guessing mode
     * @returns whether the user would have been correct if typos were allowed
     */
    isSimilarGuess(guess: string, guessModeType: GuessModeType): boolean {
        const songGuessResult = this.checkSongGuess(guess);
        const artistGuessResult = this.checkArtistGuess(guess);
        if (
            guessModeType === GuessModeType.SONG_NAME &&
            songGuessResult.similar
        )
            return true;
        if (guessModeType === GuessModeType.ARTIST && artistGuessResult.similar)
            return true;
        if (
            guessModeType === GuessModeType.BOTH &&
            (songGuessResult.similar || artistGuessResult.similar)
        )
            return true;
        return false;
    }

    /**
     * Stores a player's guess
     * @param playerID - The player's id
     * @param guess - The player's guess
     * @param createdAt - The time the guess was made
     * @param guessModeType - The guessing mode
     * @param typosAllowed - Whether to allow minor typos
     */
    storeGuess(
        playerID: string,
        guess: string,
        createdAt: number,
        guessModeType: GuessModeType,
        typosAllowed = false,
    ): void {
        const pointsAwarded = this.checkGuess(
            guess,
            guessModeType,
            typosAllowed,
        );

        if (this.songStartedAt === null) {
            return;
        }

        this.guesses[playerID] = this.guesses[playerID] || [];
        this.guesses[playerID].push({
            timeToGuessMs: createdAt - this.songStartedAt,
            guess,
            correct: pointsAwarded > 0,
        });

        if (
            pointsAwarded > 0 &&
            !this.correctGuessers.map((x) => x.id).includes(playerID)
        ) {
            this.incorrectGuessers.delete(playerID);
            this.correctGuessers.push(new KmqMember(playerID, pointsAwarded));
        } else if (pointsAwarded === 0) {
            this.incorrectGuessers.add(playerID);
        }
    }

    /**
     * @returns the guesses made in the round so far
     */
    getGuesses(): PlayerToGuesses {
        return this.guesses;
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
     * @returns true if the given UUID is one of the interactions (i.e. guesses) of the current game round
     */
    isValidInteraction(interactionUUID: string): boolean {
        return (
            interactionUUID === this.interactionCorrectAnswerUUID ||
            Object.keys(this.interactionIncorrectAnswerUUIDs).includes(
                interactionUUID,
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
        return State.bonusArtists.has(this.song.artistName);
    }

    getEndRoundDescription(
        messageContext: MessageContext,
        uniqueSongCounter: UniqueSongCounter,
        playerRoundResults: Array<PlayerRoundResult>,
        gameType: GameType,
    ): string {
        let correctDescription = "";
        if (this.bonusModifier > 1 || this.isBonusArtist()) {
            let bonusType: string;
            if (this.isBonusArtist() && this.bonusModifier > 1) {
                bonusType = i18n.translate(
                    messageContext.guildID,
                    "misc.inGame.bonusExpArtistRound",
                );
            } else if (this.bonusModifier > 1) {
                bonusType = i18n.translate(
                    messageContext.guildID,
                    "misc.inGame.bonusExpRound",
                );
            } else {
                bonusType = i18n.translate(
                    messageContext.guildID,
                    "misc.inGame.bonusArtistRound",
                );
            }

            correctDescription += `⭐__**${bonusType}**__⭐\n`;
        }

        const correctGuess = playerRoundResults.length > 0;
        const sortedGuesses = Object.entries(this.guesses).map(
            (x): [string, Array<GuessResult>] => [
                x[0],
                x[1].sort((a, b) => a.timeToGuessMs - b.timeToGuessMs),
            ],
        );

        if (gameType === GameType.HIDDEN) {
            for (const entry of sortedGuesses
                .map((x): [string, GuessResult] => {
                    const playerID = x[0];
                    const mostRecentGuess = x[1].pop()!;

                    return [playerID, mostRecentGuess];
                })
                .sort((a, b) => a[1].timeToGuessMs - b[1].timeToGuessMs)
                .slice(0, ROUND_MAX_RUNNERS_UP)) {
                const userID = entry[0];
                const timeToGuessMs = entry[1].timeToGuessMs;
                const isCorrect = entry[1].correct;
                let displayedGuess = entry[1].guess;
                if (displayedGuess.length > MAX_DISPLAYED_GUESS_LENGTH) {
                    displayedGuess = `${displayedGuess.substring(
                        0,
                        MAX_DISPLAYED_GUESS_LENGTH,
                    )}...`;
                }

                const playerResult = playerRoundResults.find(
                    (x) => x.player.id === userID,
                );

                const streak =
                    playerResult && playerResult.streak >= 5
                        ? ` (🔥${friendlyFormattedNumber(
                              playerRoundResults[0].streak,
                          )}) `
                        : " ";

                const expGain = playerResult
                    ? ` (+${friendlyFormattedNumber(playerResult.expGain)} EXP)`
                    : "";

                correctDescription += `\n${
                    isCorrect ? CORRECT_GUESS_EMOJI : INCORRECT_GUESS_EMOJI
                } ${getMention(userID)}: \`\`${displayedGuess}\`\`${streak}(${
                    timeToGuessMs <= QUICK_GUESS_MS ? QUICK_GUESS_EMOJI : ""
                }${timeToGuessMs / 1000}s)${expGain}`;
            }

            if (Object.keys(this.guesses).length >= ROUND_MAX_RUNNERS_UP) {
                correctDescription += `\n${i18n.translate(
                    messageContext.guildID,
                    "misc.andManyOthers",
                )}`;
            }
        } else if (correctGuess) {
            const correctGuesser = `${getMention(
                playerRoundResults[0].player.id,
            )} ${
                playerRoundResults[0].streak >= 5
                    ? `(🔥${friendlyFormattedNumber(
                          playerRoundResults[0].streak,
                      )})`
                    : ""
            }`;

            const playerIDToTimeToGuess: {
                [playerID: string]: string;
            } = {};

            for (const [playerID, guesses] of sortedGuesses) {
                const earliestGuess = guesses.find((x) => x.correct);

                if (earliestGuess) {
                    playerIDToTimeToGuess[playerID] = `${
                        earliestGuess.timeToGuessMs <= QUICK_GUESS_MS
                            ? QUICK_GUESS_EMOJI
                            : ""
                    }${earliestGuess.timeToGuessMs / 1000}`;
                }
            }

            correctDescription += i18n.translate(
                messageContext.guildID,
                "misc.inGame.correctGuess",
                {
                    correctGuesser,
                    expGain: friendlyFormattedNumber(
                        playerRoundResults[0].expGain,
                    ),
                    timeToGuess:
                        playerIDToTimeToGuess[playerRoundResults[0].player.id],
                },
            );
            if (playerRoundResults.length > 1) {
                const runnersUp = playerRoundResults.slice(1);
                let runnersUpDescription = runnersUp
                    .map(
                        (x) =>
                            `${getMention(
                                x.player.id,
                            )} (+${friendlyFormattedNumber(x.expGain)} EXP) (${
                                playerIDToTimeToGuess[x.player.id]
                            }s)`,
                    )
                    .slice(0, ROUND_MAX_RUNNERS_UP)
                    .join("\n");

                if (runnersUp.length >= ROUND_MAX_RUNNERS_UP) {
                    runnersUpDescription += `\n${i18n.translate(
                        messageContext.guildID,
                        "misc.andManyOthers",
                    )}`;
                }

                correctDescription += `\n\n**${i18n.translate(
                    messageContext.guildID,
                    "misc.inGame.runnersUp",
                )}**\n${runnersUpDescription}`;
            }
        } else {
            correctDescription = i18n.translate(
                messageContext.guildID,
                "misc.inGame.noCorrectGuesses",
            );
        }

        const uniqueSongMessage = this.getUniqueSongCounterMessage(
            messageContext,
            uniqueSongCounter,
        );

        return `${correctDescription}\n${uniqueSongMessage}`;
    }

    getEndRoundColor(correctGuess: boolean, userBonusActive: boolean): number {
        if (correctGuess) {
            if (userBonusActive) {
                return EMBED_SUCCESS_BONUS_COLOR;
            }

            return EMBED_SUCCESS_COLOR;
        }

        return EMBED_ERROR_COLOR;
    }

    /**
     * @param guess - The guessed string
     * @param correctChoices - The correct choices to check against
     * @returns whether the guess complies with the similarity requirements
     */
    static similarityCheck(
        guess: string,
        correctChoices: Array<string>,
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
        const guess = normalizePunctuationInName(message);
        const cleanedSongAliases = this.acceptedSongAnswers.map((x) =>
            normalizePunctuationInName(x),
        );

        return {
            exact: !!this.song.songName && cleanedSongAliases.includes(guess),
            similar: GameRound.similarityCheck(guess, cleanedSongAliases),
        };
    }

    /**
     * Checks whether the artist guess matches the GameRound's artist
     * @param message - The Message that contains the guess
     * @returns whether or not the guess was correct
     */
    private checkArtistGuess(message: string): GuessCorrectness {
        const guess = cleanArtistName(message);
        const cleanedArtistAliases = this.acceptedArtistAnswers.map((x) =>
            cleanArtistName(x),
        );

        return {
            exact: !!this.song.songName && cleanedArtistAliases.includes(guess),
            similar: GameRound.similarityCheck(guess, cleanedArtistAliases),
        };
    }

    private extractBracketedComponentsFromName(name: string): Array<string> {
        const match = name.match(/([^\s]+) \(([^)]+)\)/);

        if (match) {
            const output = [match[1], match[2]];
            return output;
        } else {
            return [name];
        }
    }
}
