import BaseCommand, { CommandArgs } from "../base_command";
import { sendOptionsMessage, getDebugLogHeader, sendErrorMessage } from "../../helpers/discord_utils";
import { getGuildPreference } from "../../helpers/game_utils";
import _logger from "../../logger";
import { GameOption } from "../../types";
import MessageContext from "../../structures/message_context";

const logger = _logger("gender");
export enum Gender {
    MALE = "male",
    FEMALE = "female",
    COED = "coed",
    ALTERNATING = "alternating",
}

export const DEFAULT_GENDER = [Gender.FEMALE, Gender.MALE, Gender.COED];

export default class GenderCommand implements BaseCommand {
    validations = {
        minArgCount: 0,
        maxArgCount: 3,
        arguments: [
            {
                name: "gender_1",
                type: "enum" as const,
                enums: Object.values(Gender),
            },
            {
                name: "gender_2",
                type: "enum" as const,
                enums: Object.values(Gender).slice(0, 3),
            },
            {
                name: "gender_3",
                type: "enum" as const,
                enums: Object.values(Gender).slice(0, 3),
            },
        ],
    };

    help = {
        name: "gender",
        description: `Choose the gender of the artists you'd like to hear from. Options are the following, \`male\`, \`female\`, and \`coed\`. Alternatively, use \`${process.env.BOT_PREFIX}gender alternating\` to rotate between \`male\` and \`female\` artists every round.`,
        usage: ",gender [gender1] {gender2} {gender3}",
        examples: [
            {
                example: "`,gender female`",
                explanation: "Play songs only from `female` artists",
            },
            {
                example: "`,gender male female`",
                explanation: "Play songs from both `male` and `female` artists",
            },
            {
                example: "`,gender coed`",
                explanation: "Play songs only from `coed` groups (groups with both male and female members)",
            },
            {
                example: "`,gender`",
                explanation: "Reset to the default genders of `male`, `female`, and `coed`",
            },
            {
                example: "`,gender alternating`",
                explanation: "Alternate between `male` and `female` artists every round",
            },
        ],
        priority: 150,
    };

    async call({ message, parsedMessage }: CommandArgs) {
        const guildPreference = await getGuildPreference(message.guildID);
        const selectedGenders = parsedMessage.components as Array<Gender>;

        if (selectedGenders.length === 0) {
            guildPreference.resetGender();
            logger.info(`${getDebugLogHeader(message)} | Gender reset.`);
            await sendOptionsMessage(MessageContext.fromMessage(message), guildPreference, { option: GameOption.GENDER, reset: true });
            return;
        }

        if (guildPreference.isGroupsMode() && selectedGenders.length >= 1) {
            // Incompatibility between groups and gender doesn't exist in GENDER.ALTERNATING
            if (selectedGenders[0] !== Gender.ALTERNATING) {
                logger.warn(`${getDebugLogHeader(message)} | Game option conflict between gender and groups.`);
                sendErrorMessage(MessageContext.fromMessage(message), { title: "Game Option Conflict", description: `\`groups\` game option is currently set. \`gender\` and \`groups\` are incompatible. Remove the \`groups\` option by typing \`${process.env.BOT_PREFIX}groups\` to proceed` });
                return;
            }
        }

        if (selectedGenders[0] === Gender.ALTERNATING) {
            if (guildPreference.isGroupsMode() && guildPreference.getGroupIDs().length === 1) {
                sendErrorMessage(MessageContext.fromMessage(message), { title: "Game Option Warning", description: `With only one group chosen, \`${process.env.BOT_PREFIX}gender alternating\` may not behave as expected. Consider including more groups to correctly alternate genders.` });
            }
            guildPreference.setGender([selectedGenders[0]]);
        } else {
            guildPreference.setGender(selectedGenders);
        }
        await sendOptionsMessage(MessageContext.fromMessage(message), guildPreference, { option: GameOption.GENDER, reset: false });
        logger.info(`${getDebugLogHeader(message)} | Genders set to ${guildPreference.getGender().join(", ")}`);
    }
}
