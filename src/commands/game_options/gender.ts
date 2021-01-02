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
                enums: Object.values(GENDER),
            },
            {
                name: "gender_3",
                type: "enum" as const,
                enums: Object.values(GENDER),
            },
        ],
    };

    help = {
        name: "gender",
        description: "Choose the gender of the artists you'd like to hear from. Options are the following, `male`, `female`, and `coed`",
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
        ],
        priority: 150,
    };

    async call({ message, parsedMessage }: CommandArgs) {
        const guildPreference = await getGuildPreference(message.guildID);
        if (guildPreference.isGroupsMode()) {
            logger.warn(`${getDebugLogHeader(message)} | Game option conflict between gender and groups.`);
            sendErrorMessage(getMessageContext(message), "Game Option Conflict", "`groups` game option is currently set. `gender` and `groups` are incompatible. Remove the `groups` option by typing `,groups`to proceed");
            return;
        }
        const selectedGenders = parsedMessage.components.length > 0 ? parsedMessage.components as GENDER[] : DEFAULT_GENDER;
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
        await sendOptionsMessage(message, guildPreference, GameOption.GENDER);
        logger.info(`${getDebugLogHeader(message)} | Genders set to ${selectedGenderStr}`);
    }
}
