const { EMBED_INFO_COLOR } = require("../helpers/utils.js");
const DEFAULT_LIMIT = 500;
const logger = require("../logger")("limit");
const getDebugContext = require("../helpers/utils").getDebugContext

module.exports = {
    call: ({ message, parsedMessage, guildPreference, db }) => {
        guildPreference.setLimit(parseInt(parsedMessage.components[0]), db);
        message.channel.send({
            embed: {
                color: EMBED_INFO_COLOR,
                author: {
                    name: message.author.username,
                    icon_url: message.author.avatarURL()
                },
                title: "**Limit**",
                description: `The limit is \`${guildPreference.getLimit()}\`.`
            }
        });
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
    DEFAULT_LIMIT
}
