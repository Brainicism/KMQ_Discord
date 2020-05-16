const { EMBED_INFO_COLOR, getDebugContext, sendOptionsMessage, GameOptions } = require("../helpers/utils.js");
const DEFAULT_LIMIT = 500;
const logger = require("../logger")("limit");

module.exports = {
    call: ({ message, parsedMessage, guildPreference, db }) => {
        guildPreference.setLimit(parseInt(parsedMessage.components[0]), db);
        sendOptionsMessage(message, guildPreference, GameOptions.LIMIT);
        logger.info(`${getDebugContext(message)} | Limit set to ${guildPreference.getLimit()}`);
    },
    validations: {
        minArgCount: 1,
        maxArgCount: 1,
        arguments: [
            {
                name: 'limit',
                type: 'number',
                minValue: 1,
                maxValue: 10000
            }
        ]
    },
    help: {
        name: "limit",
        description: "Set a maximum number of results in the song query. This effectively sets the 'Top X number of songs' based on the selected filters.",
        usage: "!limit [limit]",
        arguments: [
            {
                name: "limit",
                description: "The higher the number, popular songs become less frequent."
            }
        ]
    },
    DEFAULT_LIMIT
}
