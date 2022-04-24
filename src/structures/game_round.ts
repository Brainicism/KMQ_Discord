import {
    EMBED_ERROR_COLOR,
    EMBED_SUCCESS_BONUS_COLOR,
    EMBED_SUCCESS_COLOR,
    ExpBonusModifierValues,
    ROUND_MAX_RUNNERS_UP,
} from "../constants";
import { friendlyFormattedNumber, getMention } from "../helpers/utils";
import ExpBonusModifier from "../enums/exp_bonus_modifier";
import GuessModeType from "../enums/option_types/guess_mode_type";
import KmqMember from "./kmq_member";
import LocalizationManager from "../helpers/localization_manager";
import Round from "./round";
import State from "../state";
import _ from "lodash";
import levenshtien from "damerau-levenshtein";
import type Eris from "eris";
import type MessageContext from "./message_context";
import type PlayerRoundResult from "../interfaces/player_round_result";
import type QueriedSong from "../interfaces/queried_song";
import type UniqueSongCounter from "../interfaces/unique_song_counter";
/** List of characters to remove from song/artist names/guesses */
// eslint-disable-next-line no-useless-escape
const REMOVED_CHARACTERS = /[\|’\ '?!.\-,:;★*´\(\)\+\u200B]/g;
/** Set of characters to replace in song names/guesses */
const CHARACTER_REPLACEMENTS = [
    { pattern: REMOVED_CHARACTERS, replacement: "" },
    { pattern: /&/g, replacement: "and" },
];

interface GuessCorrectness {
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
    public readonly hints: { songHint: string; artistHint: string };

    /** UUID associated with right guess interaction custom_id */
    public interactionCorrectAnswerUUID: string;

    /** UUID associated with wrong guesses in multiple choice */
    public interactionIncorrectAnswerUUIDs: { [uuid: string]: number };

    /** List of players who incorrectly guessed in the multiple choice */
    public incorrectMCGuessers: Set<string>;

    /** Info about the players that won this GameRound */
    public playerRoundResults: Array<PlayerRoundResult>;

    /** The base EXP for this GameRound */
    private baseExp: number;

    constructor(song: QueriedSong) {
        super(song);
        this.acceptedSongAnswers = [song.songName, ...this.songAliases];
        if (song.hangulSongName) {
            this.acceptedSongAnswers.push(song.hangulSongName);
        }

        const artistNames = song.artistName.split("+").map((x) => x.trim());
        if (song.hangulArtistName) {
            artistNames.push(
                ...song.hangulArtistName.split("+").map((x) => x.trim())
            );
        }

        this.acceptedArtistAnswers = [...artistNames, ...this.artistAliases];

        this.hintUsed = false;
        this.hintRequesters = new Set();
        this.correctGuessers = [];
        this.finished = false;
        this.hints = {
            songHint: generateHint(song.songName),
            artistHint: generateHint(song.artistName),
        };
        this.interactionCorrectAnswerUUID = null;
        this.interactionIncorrectAnswerUUIDs = {};
        this.incorrectMCGuessers = new Set();
        this.interactionMessage = null;
        this.playerRoundResults = [];
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
                    State.client.users.get(userID),
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
     * @returns true if the given UUID is one of the interactions (i.e. guesses) of the current game round
     */
    isValidInteraction(interactionUUID: string): boolean {
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
        return State.bonusArtists.has(this.song.artistName);
    }

    getEndRoundDescription(
        messageContext: MessageContext,
        uniqueSongCounter: UniqueSongCounter,
        playerRoundResults: Array<PlayerRoundResult>
    ): string {
        let correctDescription = "";
        if (this.bonusModifier > 1 || this.isBonusArtist()) {
            let bonusType: string;
            if (this.isBonusArtist() && this.bonusModifier > 1) {
                bonusType = LocalizationManager.localizer.translate(
                    messageContext.guildID,
                    "misc.inGame.bonusExpArtistRound"
                );
            } else if (this.bonusModifier > 1) {
                bonusType = LocalizationManager.localizer.translate(
                    messageContext.guildID,
                    "misc.inGame.bonusExpRound"
                );
            } else {
                bonusType = LocalizationManager.localizer.translate(
                    messageContext.guildID,
                    "misc.inGame.bonusArtistRound"
                );
            }

            correctDescription += `⭐__**${bonusType}**__⭐\n`;
        }

        const correctGuess = playerRoundResults.length > 0;
        if (correctGuess) {
            const correctGuesser = `${getMention(
                playerRoundResults[0].player.id
            )} ${
                playerRoundResults[0].streak >= 5
                    ? `(🔥 ${friendlyFormattedNumber(
                          playerRoundResults[0].streak
                      )})`
                    : ""
            }`;

            correctDescription += LocalizationManager.localizer.translate(
                messageContext.guildID,
                "misc.inGame.correctGuess",
                {
                    correctGuesser,
                    expGain: friendlyFormattedNumber(
                        playerRoundResults[0].expGain
                    ),
                }
            );
            if (playerRoundResults.length > 1) {
                const runnersUp = playerRoundResults.slice(1);
                let runnersUpDescription = runnersUp
                    .map(
                        (x) =>
                            `${getMention(
                                x.player.id
                            )} (+${friendlyFormattedNumber(x.expGain)} EXP)`
                    )
                    .slice(0, ROUND_MAX_RUNNERS_UP)
                    .join("\n");

                if (runnersUp.length >= ROUND_MAX_RUNNERS_UP) {
                    runnersUpDescription += `\n${LocalizationManager.localizer.translate(
                        messageContext.guildID,
                        "misc.andManyOthers"
                    )}`;
                }

                correctDescription += `\n\n**${LocalizationManager.localizer.translate(
                    messageContext.guildID,
                    "misc.inGame.runnersUp"
                )}**\n${runnersUpDescription}`;
            }
        }

        if (!correctGuess) {
            correctDescription = LocalizationManager.localizer.translate(
                messageContext.guildID,
                "misc.inGame.noCorrectGuesses"
            );
        }

        const uniqueSongMessage = this.getUniqueSongCounterMessage(
            messageContext,
            uniqueSongCounter
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
            exact: this.song.songName && cleanedSongAliases.includes(guess),
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
            exact: this.song.songName && cleanedArtistAliases.includes(guess),
            similar: GameRound.similarityCheck(guess, cleanedArtistAliases),
        };
    }
}
