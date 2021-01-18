import BaseCommand, { CommandArgs } from "../base_command";
import { sendOptionsMessage, getDebugLogHeader, sendErrorMessage, getMessageContext } from "../../helpers/discord_utils";
import { getGuildPreference } from "../../helpers/game_utils";
import _logger from "../../logger";
import { GameOption } from "../../types";

const logger = _logger("gender");
export enum GENDER {
    MALE = "male",
    FEMALE = "female",
    COED = "coed",
    ALTERNATING = "alternating",
}

export const DEFAULT_GENDER = [GENDER.FEMALE, GENDER.MALE, GENDER.COED];

export default class GenderCommand implements BaseCommand {
    validations = {
        minArgCount: 0,
        maxArgCount: 3,
        arguments: [
            {
                name: "gender_1",
                type: "enum" as const,
                enums: Object.values(GENDER),
            },
            {
                name: "gender_2",
                type: "enum" as const,
                enums: Object.values(GENDER).slice(0, 3),
            },
            {
                name: "gender_3",
                type: "enum" as const,
                enums: Object.values(GENDER).slice(0, 3),
            },
        ],
    };

    help = {
        name: "gender",
        description: `Choose the gender of the artists you'd like to hear from. Options are the following, \`male\`, \`female\`, and \`coed\`. Alternatively, use \`${process.env.BOT_PREFIX}gender alternating\` to rotate between \`male\` and \`female\` artists each song.`,
        usage: "!gender [gender1] {gender2} {gender3}",
        examples: [
            {
                example: "`!gender female`",
                explanation: "Play songs only from `female` artists",
            },
            {
                example: "`!gender male female`",
                explanation: "Play songs from both `male` and `female` artists",
            },
            {
                example: "`!gender coed`",
                explanation: "Play songs only from `coed` groups (groups with both male and female members)",
            },
            {
                example: "`!gender`",
                explanation: "Reset to the default genders of `male`, `female`, and `coed`",
            },
            {
                example: "`!gender alternating`",
                explanation: "Play songs by `male` and `female` artists, switching between the two genders every round",
            },
        ],
        priority: 150,
    };

    async call({ message, parsedMessage }: CommandArgs) {
        const guildPreference = await getGuildPreference(message.guildID);
        const selectedGenders = parsedMessage.components as GENDER[];

        // Groups can only be chosen with alternating genders
        if (guildPreference.isGroupsMode() && !selectedGenders.includes(GENDER.ALTERNATING)) {
            logger.warn(`${getDebugLogHeader(message)} | Game option conflict between gender and groups.`);
            sendErrorMessage(getMessageContext(message), "Game Option Conflict", `\`groups\` game option is currently set. \`gender\` and \`groups\` are incompatible. Remove the \`groups\` option by typing \`${process.env.BOT_PREFIX}groups\` to proceed`);
            return;
        }

        if (parsedMessage.components.length === 0) {
            guildPreference.resetGender();
            logger.info(`${getDebugLogHeader(message)} | Gender reset.`);
            await sendOptionsMessage(message, guildPreference, { option: GameOption.GENDER, reset: true });
            return;
        }

        if (parsedMessage.components.length > 1 && selectedGenders.includes(GENDER.ALTERNATING)) {
            logger.warn(`${getDebugLogHeader(message)} | Game option conflict between alternating genders and genders.`);
            sendErrorMessage(getMessageContext(message), "Game Option Conflict", `\`${process.env.BOT_PREFIX}gender alternating\` already switches between male and female artists; you cannot include more genders. Instead, type \`${process.env.BOT_PREFIX}gender alternating\``);
            return;
        }

        if (selectedGenders.includes(GENDER.ALTERNATING) && guildPreference.isGroupsMode() && guildPreference.getGroupIds().length === 1) {
            sendErrorMessage(getMessageContext(message), "Game Option Warning", `With only one group chosen, \`${process.env.BOT_PREFIX}gender alternating\` may not behave as expected. Consider including more groups to correctly alternate genders.`);
        }

        const selectedGenderArray = guildPreference.setGender(selectedGenders);
        let selectedGenderStr = "";
        for (let i = 0; i < selectedGenderArray.length; i++) {
            selectedGenderStr += `\`${selectedGenderArray[i]}\``;
            if (i === selectedGenderArray.length - 1) {
                break;
            } else if (i === selectedGenderArray.length - 2) {
                selectedGenderStr += " and ";
            } else {
                selectedGenderStr += ", ";
            }
        }
        await sendOptionsMessage(message, guildPreference, { option: GameOption.GENDER, reset: false });
        logger.info(`${getDebugLogHeader(message)} | Genders set to ${selectedGenderStr}`);
    }
}
