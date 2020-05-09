const GENDER = { MALE: "male", FEMALE: "female", COED: "coed" }
const logger = require("../logger")("gender");
const getDebugContext = require("../helpers/utils").getDebugContext
const { sendErrorMessage, sendInfoMessage } = require("../helpers/utils.js");

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
            sendInfoMessage(message,
                "**Gender**",
                `Songs will be played from ${selectedGenderStr} artists.`)
        }
        sendErrorMessage(message,
            "**Gender**",
            `Please enter valid genders only (\`male\`, \`female\`, and/or \`coed\`).`)
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
    GENDER
}

