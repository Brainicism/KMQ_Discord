const { sendInfoMessage, getDebugContext } = require("../helpers/utils.js");
const DEFAULT_BOT_PREFIX = ",";
const logger = require("../logger")("prefix");

module.exports = {
    call: ({ message, parsedMessage, guildPreference, db }) => {
        guildPreference.setBotPrefix(parsedMessage.components[0], db);
        sendInfoMessage(message,
            "Bot prefix",
            `The prefix is \`${guildPreference.getBotPrefix()}\`.`
        );
        logger.info(`${getDebugContext(message)} | Prefix set to ${guildPreference.getBotPrefix()}`);
    },
    validations: {
        minArgCount: 1,
        maxArgCount: 1,
        arguments: [
            {
                name: 'prefix',
                type: 'char'
            }
        ]
    },
    DEFAULT_BOT_PREFIX
}
