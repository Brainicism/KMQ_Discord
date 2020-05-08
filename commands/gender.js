const GENDER = { MALE: "male", FEMALE: "female", COED: "coed" }
const logger = require("../logger")("gender");
const getDebugContext = require("../helpers/utils").getDebugContext
const { EMBED_INFO_COLOR, EMBED_ERROR_COLOR } = require("../helpers/utils.js");

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
            message.channel.send({
                embed: {
                    color: EMBED_INFO_COLOR,
                    author: {
                        name: message.author.username,
                        icon_url: message.author.avatarURL()
                    },
                    title: "**Gender**",
                    description: `Songs will be played from ${selectedGenderStr} artists.`
                }
            });
        }
        else {
            message.channel.send({
                embed: {
                    color: EMBED_ERROR_COLOR,
                    author: {
                        name: message.author.username,
                        icon_url: message.author.avatarURL()
                    },
                    title: "**Gender**",
                    description: `Please enter valid genders only (\`male\`, \`female\`, and/or \`coed\`).`
                }
            });
        }
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

