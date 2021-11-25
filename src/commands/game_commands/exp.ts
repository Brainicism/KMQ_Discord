/* eslint-disable @typescript-eslint/dot-notation */
import Eris from "eris";
import {
    getDebugLogHeader,
    sendInfoMessage,
} from "../../helpers/discord_utils";
import BaseCommand, { CommandArgs } from "../interfaces/base_command";
import { IPCLogger } from "../../logger";
import MessageContext from "../../structures/message_context";
import { isPowerHour, isWeekend } from "../../helpers/utils";
import {
    getGuildPreference,
    getAvailableSongCount,
    userBonusIsActive,
} from "../../helpers/game_utils";
import { AnswerType } from "../game_options/answer";
import { GuessModeType } from "../game_options/guessmode";
import { KmqImages } from "../../constants";
import { state } from "../../kmq_worker";
import GuildPreference from "../../structures/guild_preference";
import GameRound from "../../structures/game_round";

const logger = new IPCLogger("exp");
export const PARTICIPANT_MODIFIER_MAX_PARTICIPANTS = 6;
export const GUESS_STREAK_THRESHOLD = 5;
export enum ExpBonusModifier {
    POWER_HOUR,
    BONUS_ARTIST,
    VOTE,
    GUESS_STREAK,
    QUICK_GUESS,
    MC_GUESS_EASY,
    MC_GUESS_MEDIUM,
    MC_GUESS_HARD,
    ARTIST_GUESS,
    ARTIST_GUESS_GROUPS_SELECTED,
    RANDOM_GUESS_BONUS_COMMON,
    RANDOM_GUESS_BONUS_RARE,
    RANDOM_GUESS_BONUS_EPIC,
    RANDOM_GUESS_BONUS_LEGENDARY,
    BELOW_SONG_COUNT_THRESHOLD,
}

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
};

interface ExpModifier {
    displayName: string;
    name: ExpBonusModifier;
    isPenalty: boolean;
}

export async function calculateOptionsExpMultiplierInternal(
    guildPreference: GuildPreference,
    voteBonusExp: boolean
): Promise<Array<ExpModifier>> {
    const modifiers: Array<ExpModifier> = [];
    // bonus for voting
    if (voteBonusExp) {
        modifiers.push({
            displayName: "Vote Bonus",
            name: ExpBonusModifier.VOTE,
            isPenalty: false,
        });
    }

    // power hour bonus
    if (isWeekend() || isPowerHour()) {
        modifiers.push({
            displayName: "Power Hour Bonus",
            name: ExpBonusModifier.POWER_HOUR,
            isPenalty: false,
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
            displayName: "Multiple Choice Penalty",
            name: multipleChoicePenalty,
            isPenalty: true,
        });
    }

    const totalSongs = (await getAvailableSongCount(guildPreference)).count;
    if (totalSongs < 10) {
        modifiers.push({
            displayName: "Low Song Count Penalty",
            name: ExpBonusModifier.BELOW_SONG_COUNT_THRESHOLD,
            isPenalty: true,
        });
    }

    // penalize for using artist guess modes
    if (
        guildPreference.gameOptions.guessModeType === GuessModeType.ARTIST ||
        guildPreference.gameOptions.guessModeType === GuessModeType.BOTH
    ) {
        if (guildPreference.isGroupsMode()) {
            modifiers.push({
                displayName: "Artist/Group Guess Mode Penalty",
                name: ExpBonusModifier.ARTIST_GUESS_GROUPS_SELECTED,
                isPenalty: true,
            });
        } else {
            modifiers.push({
                displayName: "Artist/Group Guess Mode Penalty",
                name: ExpBonusModifier.ARTIST_GUESS,
                isPenalty: true,
            });
        }
    }

    return modifiers;
}

async function calculateOptionsExpMultiplier(
    guildPreference: GuildPreference,
    voteBonusExp: boolean
): Promise<number> {
    return (
        await calculateOptionsExpMultiplierInternal(
            guildPreference,
            voteBonusExp
        )
    ).reduce((a, b) => ExpBonusModifierValues[b.name] * a, 1);
}

export function participantExpScalingModifier(numParticipants: number): number {
    return (
        1 +
        0.1 *
            (Math.min(numParticipants, PARTICIPANT_MODIFIER_MAX_PARTICIPANTS) -
                1)
    );
}

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

export async function calculateTotalRoundExp(
    guildPreference: GuildPreference,
    gameRound: GameRound,
    numParticipants: number,
    streak: number,
    guessSpeed: number,
    place: number,
    voteBonusExp: boolean
): Promise<number> {
    const optionsMultiplier = await calculateOptionsExpMultiplier(
        guildPreference,
        voteBonusExp
    );

    const roundMultipler = calculateRoundExpMultiplier(
        gameRound,
        numParticipants,
        streak,
        guessSpeed,
        place
    );

    return Math.floor(
        optionsMultiplier * roundMultipler * gameRound.getExpReward()
    );
}

export default class ExpCommand implements BaseCommand {
    help = {
        name: "exp",
        description:
            "Shows your current EXP modifier, and the list of current bonus EXP artists.",
        usage: ",exp",
        examples: [],
        priority: 50,
    };

    call = async ({ message }: CommandArgs): Promise<void> => {
        const voteBonusActive = await userBonusIsActive(message.author.id);
        const guildPreference = await getGuildPreference(message.guildID);
        const fields: Array<Eris.EmbedField> = [];

        const activeModifiers = await calculateOptionsExpMultiplierInternal(
            guildPreference,
            voteBonusActive
        );

        const totalModifier = await calculateOptionsExpMultiplier(
            guildPreference,
            voteBonusActive
        );

        const modifierText: Array<string> = activeModifiers.map(
            (x) =>
                `\`${x.displayName}:\` ${ExpBonusModifierValues[x.name].toFixed(
                    2
                )}x ${x.isPenalty ? "📉" : "📈"}`
        );

        modifierText.push(
            `\`Total Modifier:\` **__${totalModifier.toFixed(2)}x__**`
        );

        fields.push({
            name: "🚀 Active Modifiers 🚀",
            value: `${modifierText.join("\n")}`,
            inline: false,
        });

        fields.push({
            name: "🎤 Current Bonus Artists 🎤",
            value: `\`Guessing songs by the daily bonus artists:\`  ${ExpBonusModifierValues[
                ExpBonusModifier.BONUS_ARTIST
            ].toFixed(2)}x 📈 \n\`\`\`${[...state.bonusArtists]
                .filter((x) => !x.includes("+"))
                .join(", ")}\`\`\``,
            inline: false,
        });

        const bonusExpExplanations = [
            `\`Playing during a KMQ Power Hour or Weekend:\` ${ExpBonusModifierValues[
                ExpBonusModifier.POWER_HOUR
            ].toFixed(2)}x 📈`,
            `\`Voting!:\` ${ExpBonusModifierValues[
                ExpBonusModifier.VOTE
            ].toFixed(2)}x 📈`,
            `\`Having a guess streak of over 5:\` ${ExpBonusModifierValues[
                ExpBonusModifier.GUESS_STREAK
            ].toFixed(2)}x 📈`,
            `\`Guessing quickly:\` ${ExpBonusModifierValues[
                ExpBonusModifier.QUICK_GUESS
            ].toFixed(2)}x 📈 `,
            `\`Guessing correctly for a bonus artist:\` ${ExpBonusModifierValues[
                ExpBonusModifier.BONUS_ARTIST
            ].toFixed(2)}x 📈 `,
            "`Rare correct guesses bonus:` 2.00x up to 50.00x 📈",
        ];

        fields.push({
            name: "Ways to get EXP Bonuses",
            value: `You can get bonus EXP for the following:\n ${bonusExpExplanations
                .map((x) => `- ${x}`)
                .join("\n")}`,
            inline: false,
        });

        await sendInfoMessage(MessageContext.fromMessage(message), {
            title: "EXP Bonuses",
            fields,
            thumbnailUrl: KmqImages.THUMBS_UP,
        });

        logger.info(
            `${getDebugLogHeader(message)} | EXP modifier info retrieved.`
        );
    };
}
