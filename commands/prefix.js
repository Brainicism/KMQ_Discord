const { EMBED_INFO_COLOR } = require("../helpers/utils.js");
const DEFAULT_BOT_PREFIX = ",";
const logger = require("../logger")("prefix");
const getDebugContext = require("../helpers/utils").getDebugContext

module.exports = {
    call: ({ message, parsedMessage, guildPreference, db }) => {
        guildPreference.setBotPrefix(parsedMessage.components[0], db);
        message.channel.send({
            embed: {
                color: EMBED_INFO_COLOR,
                author: {
                    name: message.author.username,
                    icon_url: message.author.avatarURL()
                },
                title: "**Bot prefix**",
                description: `The prefix is \`${guildPreference.getBotPrefix()}\`.`
            }
        });
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
