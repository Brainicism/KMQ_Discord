const GENDER = { MALE: "male", FEMALE: "female", COED: "coed" }
const logger = require("../logger")("gender");
const { sendOptionsMessage, getDebugContext, GameOptions } = require("../helpers/utils.js");

module.exports = {
    call: ({ guildPreference, message, parsedMessage, db }) => {
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
        sendOptionsMessage(message, guildPreference, GameOptions.GENDER);
        logger.info(`${getDebugContext(message)} | Genders set to ${selectedGenderStr}`);
    },
    validations: {
        minArgCount: 1,
        maxArgCount: 3,
        arguments: [
            {
                name: 'gender_1',
                type: 'enum',
                enums: Object.values(GENDER)
            },
            {
                name: 'gender_2',
                type: 'enum',
                enums: Object.values(GENDER)
            },
            {
                name: 'gender_3',
                type: 'enum',
                enums: Object.values(GENDER)
            }
        ]
    },
    help: {
        name: "gender",
        description: "Choose the gender of the artists you'd like to hear from.",
        usage: "!gender [gender1] [gender2] [gender3]",
        arguments: [
            {
                name: "gender",
                description: "To choose between multiple genders, enter each gender separated by a space. Valid values are \`female\`, \`male\`, and \`coed\`"
            }
        ]
    },
    GENDER
}

