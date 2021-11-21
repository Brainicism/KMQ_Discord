/* eslint-disable @typescript-eslint/dot-notation */
import Eris from "eris";
import { getDebugLogHeader, sendInfoMessage } from "../../helpers/discord_utils";
import BaseCommand, { CommandArgs } from "../interfaces/base_command";
import { IPCLogger } from "../../logger";
import MessageContext from "../../structures/message_context";
import { isPowerHour, isWeekend } from "../../helpers/utils";
import { getGuildPreference, userBonusIsActive } from "../../helpers/game_utils";
import { AnswerType } from "../game_options/answer";
import { GuessModeType } from "../game_options/guessmode";
import { KmqImages } from "../../constants";

const logger = new IPCLogger("exp");
export enum ExpBonusModifiers {
    POWER_HOUR = 2,
    VOTE = 2,
    GUESS_STREAK = 1.2,
    QUICK_GUESS = 1.1,
    MC_GUESS_EASY = 0.25,
    MC_GUESS_MEDIUM = 0.5,
    MC_GUESS_HARD = 0.75,
    ARTIST_GUESS = 0.3,
    RANDOM_GUESS_BONUS_COMMON = 2,
    RANDOM_GUESS_BONUS_RARE = 5,
    RANDOM_GUESS_BONUS_EPIC = 10,
    RANDOM_GUESS_BONUS_LEGENDARY = 50,
}

export default class ExpCommand implements BaseCommand {
    help = {
        name: "exp",
        description: "Shows your current EXP modifier.",
        usage: ",exp",
        examples: [],
        priority: 50,
    };

    call = async ({ message }: CommandArgs) => {
        const powerHourBonusActive = isPowerHour();
        const weekendBonusActive = isWeekend();
        const voteBonusActive = await userBonusIsActive(message.author.id);
        const guildPreference = await getGuildPreference(message.guildID);
        const fields: Array<Eris.EmbedField> = [];

        let totalModifier = 1.0;
        const powerHourModifier = (powerHourBonusActive || weekendBonusActive) ? ExpBonusModifiers.POWER_HOUR : 1;
        const modifierText: Array<string> = [];
        totalModifier *= powerHourModifier;
        modifierText.push(`\`Power Hour/Weekend Bonus:\` ${powerHourModifier.toFixed(2)}x 📈`);

        const voteModifier = voteBonusActive ? ExpBonusModifiers.VOTE : 1;
        totalModifier *= voteModifier;
        modifierText.push(`\`Vote Bonus:\` ${voteModifier.toFixed(2)}x 📈`);

        if (guildPreference.isMultipleChoiceMode()) {
            const answerType = guildPreference.gameOptions.answerType;
            let multipleChoiceModifier: number;
            switch (answerType) {
                case AnswerType.MULTIPLE_CHOICE_EASY:
                    multipleChoiceModifier = ExpBonusModifiers.MC_GUESS_EASY;
                    break;
                case AnswerType.MULTIPLE_CHOICE_MED:
                    multipleChoiceModifier = ExpBonusModifiers.MC_GUESS_MEDIUM;
                    break;
                case AnswerType.MULTIPLE_CHOICE_HARD:
                    multipleChoiceModifier = ExpBonusModifiers.MC_GUESS_HARD;
                    break;
                default:
                    logger.error(`Unexpected multiple choice answer type: ${answerType}`);
                    return;
            }

            totalModifier *= multipleChoiceModifier;
            modifierText.push(`\`Multiple Choice Penalty:\` ${multipleChoiceModifier.toFixed(2)}x 📉`);
        }

        if (guildPreference.gameOptions.guessModeType === GuessModeType.ARTIST || guildPreference.gameOptions.guessModeType === GuessModeType.BOTH) {
            const artistModeMultiplier = guildPreference.isGroupsMode() ? 0 : ExpBonusModifiers.ARTIST_GUESS;
            totalModifier *= artistModeMultiplier;
            modifierText.push(`\`Artist/Group Guess Mode Penalty:\` ${artistModeMultiplier.toFixed(2)}x 📉`);
        }

        modifierText.push(`\`Total Modifier:\` **__${totalModifier.toFixed(2)}x__**`);

        fields.push({
            name: "🚀 Active Modifiers 🚀",
            value: `${modifierText.join("\n")}`,
            inline: false,
        });

        fields.push({
            name: "Other EXP Bonuses 📈",
            value: `You can get bonus EXP for the following:\n- \`Having a guess streak of over 5:\` ${ExpBonusModifiers.GUESS_STREAK}x \n- \`Guessing quickly:\` ${ExpBonusModifiers.QUICK_GUESS}x \n- \`Rare correct guesses bonus\`: 2x up to 50x!`,
            inline: false,
        });

        logger.info(`${getDebugLogHeader(message)} | User requested EXP modifier info.`);

        sendInfoMessage(MessageContext.fromMessage(message), {
            title: "EXP Bonuses",
            fields,
            thumbnailUrl: KmqImages.THUMBS_UP,
        });
    };
}
