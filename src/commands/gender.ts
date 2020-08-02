import BaseCommand, { CommandArgs } from "./base_command";
import { sendOptionsMessage, getDebugContext, sendErrorMessage } from "../helpers/discord_utils";
import { GameOptions, getGuildPreference } from "../helpers/game_utils";
import _logger from "../logger";
const logger = _logger("gender");
const GENDER: { [gender: string]: string } = { MALE: "male", FEMALE: "female", COED: "coed" }

class GenderCommand implements BaseCommand {
    async call({ message, parsedMessage, db }: CommandArgs) {
        let guildPreference = await getGuildPreference(db, message.guild.id);
        if (guildPreference.getGroupIds() !== null) {
            sendErrorMessage(message, "Game Option Conflict", `\`groups\` game option is currently set. \`gender\` and \`groups\` are incompatible. Remove the \`groups\` option to proceed`);
            return;
        }
        let selectedGenderArray = guildPreference.setGender(parsedMessage.components, db);
        let selectedGenderStr = "";
        for (let i = 0; i < selectedGenderArray.length; i++) {
            selectedGenderStr += `\`${selectedGenderArray[i]}\``;
            if (i === selectedGenderArray.length - 1) {
                break;
            }
            else if (i === selectedGenderArray.length - 2) {
                selectedGenderStr += " and ";
            }
            else {
                selectedGenderStr += ", ";
            }

        }
        await sendOptionsMessage(message, guildPreference, db, GameOptions.GENDER);
        logger.info(`${getDebugContext(message)} | Genders set to ${selectedGenderStr}`);
    }
    validations = {
        minArgCount: 1,
        maxArgCount: 3,
        arguments: [
            {
                name: "gender_1",
                type: "enum" as const,
                enums: Object.values(GENDER)
            },
            {
                name: "gender_2",
                type: "enum" as const,
                enums: Object.values(GENDER)
            },
            {
                name: "gender_3",
                type: "enum" as const,
                enums: Object.values(GENDER)
            }
        ]
    }

    help = {
        name: "gender",
        description: "Choose the gender of the artists you'd like to hear from.",
        usage: "!gender [gender1] [gender2] [gender3]",
        arguments: [
            {
                name: "gender",
                description: "To choose between multiple genders, enter each gender separated by a space. Valid values are \`female\`, \`male\`, and \`coed\`"
            }
        ]
    }
}
export default GenderCommand;
export {
    GENDER
}
