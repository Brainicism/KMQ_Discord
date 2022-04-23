/* eslint-disable @typescript-eslint/dot-notation */
import type Eris from "eris";
import {
    getDebugLogHeader,
    sendInfoMessage,
} from "../../helpers/discord_utils";
import type BaseCommand from "../interfaces/base_command";
import { IPCLogger } from "../../logger";
import MessageContext from "../../structures/message_context";
import { isWeekend } from "../../helpers/utils";
import {
    getGuildPreference,
    getAvailableSongCount,
    userBonusIsActive,
    isFirstGameOfDay,
    isPowerHour,
    isPremiumRequest,
} from "../../helpers/game_utils";
import { KmqImages } from "../../constants";
import State from "../../state";
import type GuildPreference from "../../structures/guild_preference";
import type GameRound from "../../structures/game_round";
import type CommandArgs from "../../interfaces/command_args";
import type HelpDocumentation from "../../interfaces/help";
import { AnswerType } from "../../enums/option_types/answer_type";
import { GuessModeType } from "../../enums/option_types/guess_mode_type";
import { ExpBonusModifier } from "../../enums/exp_bonus_modifier";

const logger = new IPCLogger("exp");
export const PARTICIPANT_MODIFIER_MAX_PARTICIPANTS = 6;
export const GUESS_STREAK_THRESHOLD = 5;

export const ExpBonusModifierValues = {
    [ExpBonusModifier.POWER_HOUR]: 2,
    [ExpBonusModifier.BONUS_ARTIST]: 2,
    [ExpBonusModifier.VOTE]: 2,
    [ExpBonusModifier.GUESS_STREAK]: 1.2,
    [ExpBonusModifier.QUICK_GUESS]: 1.1,
    [ExpBonusModifier.MC_GUESS_EASY]: 0.25,
    [ExpBonusModifier.MC_GUESS_MEDIUM]: 0.5,
    [ExpBonusModifier.MC_GUESS_HARD]: 0.75,
    [ExpBonusModifier.ARTIST_GUESS]: 0.3,
    [ExpBonusModifier.ARTIST_GUESS_GROUPS_SELECTED]: 0,
    [ExpBonusModifier.RANDOM_GUESS_BONUS_COMMON]: 2,
    [ExpBonusModifier.RANDOM_GUESS_BONUS_RARE]: 5,
    [ExpBonusModifier.RANDOM_GUESS_BONUS_EPIC]: 10,
    [ExpBonusModifier.RANDOM_GUESS_BONUS_LEGENDARY]: 50,
    [ExpBonusModifier.BELOW_SONG_COUNT_THRESHOLD]: 0,
    [ExpBonusModifier.TYPO]: 0.8,
    [ExpBonusModifier.HINT_USED]: 0.5,
    [ExpBonusModifier.FIRST_GAME_OF_DAY]: 1.5,
};

interface ExpModifier {
    displayName: string;
    name: ExpBonusModifier;
    isPenalty: boolean;
}

/**
 * Calculates the exp multiplier based on the round options
 * @param guildPreference - The guild preference
 * @param voteBonusExp - Whether bonus EXP should be applied to the modifier
 * @param playerID - the player's ID
 * @returns an array describing the EXP modifiers activated and their numerical value
 */
export async function calculateOptionsExpMultiplierInternal(
    guildPreference: GuildPreference,
    voteBonusExp: boolean,
    playerID: string
): Promise<Array<ExpModifier>> {
    const modifiers: Array<ExpModifier> = [];
    // bonus for voting
    if (voteBonusExp) {
        modifiers.push({
            displayName: State.localizer.translate(
                guildPreference.guildID,
                "command.exp.voteBonus"
            ),
            name: ExpBonusModifier.VOTE,
            isPenalty: false,
        });
    }

    // power hour bonus
    if (isWeekend() || isPowerHour()) {
        modifiers.push({
            displayName: State.localizer.translate(
                guildPreference.guildID,
                "command.exp.powerHourBonus"
            ),
            name: ExpBonusModifier.POWER_HOUR,
            isPenalty: false,
        });
    }

    const isPlayersFirstGame = await isFirstGameOfDay(playerID);
    if (isPlayersFirstGame) {
        modifiers.push({
            displayName: State.localizer.translate(
                guildPreference.guildID,
                "command.exp.firstGameOfDayBonus"
            ),
            name: ExpBonusModifier.FIRST_GAME_OF_DAY,
            isPenalty: false,
        });
    }

    if (guildPreference.typosAllowed()) {
        modifiers.push({
            displayName: State.localizer.translate(
                guildPreference.guildID,
                "command.exp.typosAllowedPenalty"
            ),
            name: ExpBonusModifier.TYPO,
            isPenalty: true,
        });
    }

    if (guildPreference.isMultipleChoiceMode()) {
        const difficulty = guildPreference.gameOptions.answerType;
        let multipleChoicePenalty: ExpBonusModifier;
        switch (difficulty) {
            case AnswerType.MULTIPLE_CHOICE_EASY:
                multipleChoicePenalty = ExpBonusModifier.MC_GUESS_EASY;
                break;
            case AnswerType.MULTIPLE_CHOICE_MED:
                multipleChoicePenalty = ExpBonusModifier.MC_GUESS_MEDIUM;
                break;
            case AnswerType.MULTIPLE_CHOICE_HARD:
                multipleChoicePenalty = ExpBonusModifier.MC_GUESS_HARD;
                break;
            default:
                break;
        }

        modifiers.push({
            displayName: State.localizer.translate(
                guildPreference.guildID,
                "command.exp.multipleChoicePenalty"
            ),
            name: multipleChoicePenalty,
            isPenalty: true,
        });
    }

    const totalSongs = (
        await getAvailableSongCount(
            guildPreference,
            await isPremiumRequest(guildPreference.guildID, playerID)
        )
    ).count;

    if (totalSongs < 10) {
        modifiers.push({
            displayName: State.localizer.translate(
                guildPreference.guildID,
                "command.exp.lowSongCountPenalty"
            ),
            name: ExpBonusModifier.BELOW_SONG_COUNT_THRESHOLD,
            isPenalty: true,
        });
    }

    // penalize for using artist guess modes
    if (
        guildPreference.gameOptions.guessModeType === GuessModeType.ARTIST ||
        guildPreference.gameOptions.guessModeType === GuessModeType.BOTH
    ) {
        modifiers.push({
            displayName: State.localizer.translate(
                guildPreference.guildID,
                "command.exp.artistGroupGuessModePenalty"
            ),
            name: guildPreference.isGroupsMode()
                ? ExpBonusModifier.ARTIST_GUESS_GROUPS_SELECTED
                : ExpBonusModifier.ARTIST_GUESS,
            isPenalty: true,
        });
    }

    return modifiers;
}

async function calculateOptionsExpMultiplier(
    guildPreference: GuildPreference,
    voteBonusExp: boolean,
    playerID: string
): Promise<number> {
    return (
        await calculateOptionsExpMultiplierInternal(
            guildPreference,
            voteBonusExp,
            playerID
        )
    ).reduce((a, b) => ExpBonusModifierValues[b.name] * a, 1);
}

/**
 * @param numParticipants - The number of participants
 * @returns the EXP modifier based on the number of participants
 */
export function participantExpScalingModifier(numParticipants: number): number {
    return (
        1 +
        0.1 *
            (Math.min(numParticipants, PARTICIPANT_MODIFIER_MAX_PARTICIPANTS) -
                1)
    );
}

/**
 * @param gameRound - The game round
 * @param numParticipants - The number of participants
 * @param streak - The current guessing streak
 * @param guessSpeed - The guess speed
 * @param place - The place of the guess
 * @returns The round's total EXP modifier
 */
export function calculateRoundExpMultiplier(
    gameRound: GameRound,
    numParticipants: number,
    streak: number,
    guessSpeed: number,
    place: number
): number {
    let expModifier = 1;

    // incentivize for number of participants from 1x to 1.5x
    expModifier *= participantExpScalingModifier(numParticipants);
    // bonus for quick guess
    if (guessSpeed < 3500) {
        expModifier *= ExpBonusModifierValues[ExpBonusModifier.QUICK_GUESS];
    }

    // bonus for guess streaks
    if (streak >= GUESS_STREAK_THRESHOLD) {
        expModifier *= ExpBonusModifierValues[ExpBonusModifier.GUESS_STREAK];
    }

    // for guessing a bonus group
    if (gameRound.isBonusArtist()) {
        expModifier *= ExpBonusModifierValues[ExpBonusModifier.BONUS_ARTIST];
    }

    // random game round bonus
    expModifier *= gameRound.bonusModifier;

    // divide by chronological placement
    expModifier /= place;

    return expModifier;
}

/**
 * @param guildPreference - The guild preference
 * @param gameRound - The game round
 * @param numParticipants - The number of participants
 * @param streak - The current guessing streak
 * @param guessSpeed - The guess speed
 * @param place - The place of the guess
 * @param voteBonusExp - Whether bonus EXP should be applied to the modifier
 * @param playerID - the player's ID
 * @returns the round's total EXP based on the EXP modifiers
 */
export async function calculateTotalRoundExp(
    guildPreference: GuildPreference,
    gameRound: GameRound,
    numParticipants: number,
    streak: number,
    guessSpeed: number,
    place: number,
    voteBonusExp: boolean,
    playerID: string
): Promise<number> {
    const optionsMultiplier = await calculateOptionsExpMultiplier(
        guildPreference,
        voteBonusExp,
        playerID
    );

    const roundMultipler = calculateRoundExpMultiplier(
        gameRound,
        numParticipants,
        streak,
        guessSpeed,
        place
    );

    return Math.floor(
        optionsMultiplier *
            roundMultipler *
            gameRound.getExpReward(guildPreference.typosAllowed())
    );
}

export default class ExpCommand implements BaseCommand {
    help = (guildID: string): HelpDocumentation => ({
        name: "exp",
        description: State.localizer.translate(
            guildID,
            "command.exp.help.description"
        ),
        usage: ",exp",
        examples: [],
        priority: 50,
    });

    call = async ({ message }: CommandArgs): Promise<void> => {
        const voteBonusActive = await userBonusIsActive(message.author.id);
        const guildPreference = await getGuildPreference(message.guildID);
        const fields: Array<Eris.EmbedField> = [];

        const activeModifiers = await calculateOptionsExpMultiplierInternal(
            guildPreference,
            voteBonusActive,
            message.author.id
        );

        const totalModifier = await calculateOptionsExpMultiplier(
            guildPreference,
            voteBonusActive,
            message.author.id
        );

        const modifierText: Array<string> = activeModifiers.map(
            (x) =>
                `\`${x.displayName}:\` ${ExpBonusModifierValues[x.name].toFixed(
                    2
                )}x ${x.isPenalty ? "📉" : "📈"}`
        );

        modifierText.push(
            `\`${State.localizer.translate(
                message.guildID,
                "command.exp.totalModifier"
            )}:\` **__${totalModifier.toFixed(2)}x__**`
        );

        fields.push({
            name: State.localizer.translate(
                message.guildID,
                "command.exp.activeModifiers"
            ),
            value: `${modifierText.join("\n")}`,
            inline: false,
        });

        fields.push({
            name: State.localizer.translate(
                message.guildID,
                "command.exp.bonusArtistsTitle"
            ),
            value: `\`${State.localizer.translate(
                message.guildID,
                "command.exp.bonusArtists"
            )}:\` ${ExpBonusModifierValues[
                ExpBonusModifier.BONUS_ARTIST
            ].toFixed(2)}x 📈 \n\`\`\`${[...State.bonusArtists]
                .filter((x) => !x.includes("+"))
                .join(", ")}\`\`\``,
            inline: false,
        });

        const bonusExpExplanations = [
            `\`${State.localizer.translate(
                message.guildID,
                "command.exp.explanation.powerHour"
            )}:\` ${ExpBonusModifierValues[ExpBonusModifier.POWER_HOUR].toFixed(
                2
            )}x 📈`,
            `\`${State.localizer.translate(
                message.guildID,
                "command.exp.explanation.firstGameOfDay"
            )}:\` ${ExpBonusModifierValues[
                ExpBonusModifier.FIRST_GAME_OF_DAY
            ].toFixed(2)}x 📈`,
            `\`${State.localizer.translate(
                message.guildID,
                "command.exp.explanation.voting"
            )}!:\` ${ExpBonusModifierValues[ExpBonusModifier.VOTE].toFixed(
                2
            )}x 📈`,
            `\`${State.localizer.translate(
                message.guildID,
                "command.exp.explanation.streak"
            )}:\` ${ExpBonusModifierValues[
                ExpBonusModifier.GUESS_STREAK
            ].toFixed(2)}x 📈`,
            `\`${State.localizer.translate(
                message.guildID,
                "command.exp.explanation.quickGuess"
            )}:\` ${ExpBonusModifierValues[
                ExpBonusModifier.QUICK_GUESS
            ].toFixed(2)}x 📈 `,
            `\`${State.localizer.translate(
                message.guildID,
                "command.exp.explanation.bonusArtistGuess"
            )}:\` ${ExpBonusModifierValues[
                ExpBonusModifier.BONUS_ARTIST
            ].toFixed(2)}x 📈 `,
            `\`${State.localizer.translate(
                message.guildID,
                "command.exp.explanation.rareGuess"
            )}:\` ${State.localizer.translate(
                message.guildID,
                "command.exp.explanation.rareGuessRange",
                { rareGuessLowerBound: "2.00x", rareGuessUpperBound: "50.00x" }
            )} 📈`,
        ];

        fields.push({
            name: State.localizer.translate(
                message.guildID,
                "command.exp.bonusTitle"
            ),
            value: `${State.localizer.translate(
                message.guildID,
                "command.exp.bonusDescription"
            )}:\n ${bonusExpExplanations.map((x) => `- ${x}`).join("\n")}`,
            inline: false,
        });

        await sendInfoMessage(MessageContext.fromMessage(message), {
            title: State.localizer.translate(
                message.guildID,
                "command.exp.title"
            ),
            fields,
            thumbnailUrl: KmqImages.THUMBS_UP,
        });

        logger.info(
            `${getDebugLogHeader(message)} | EXP modifier info retrieved.`
        );
    };
}
