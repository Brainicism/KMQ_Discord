const BEGINNING_SEARCH_YEAR = 2008;
const logger = require ("../logger")("cutoff");
const getDebugContext = require("../helpers/utils").getDebugContext
module.exports = {
    call: ({ message, parsedMessage, guildPreference, db }) => {
        guildPreference.setBeginningCutoffYear(parseInt(parsedMessage.components[0]), db);
        message.channel.send(`The new cutoff year is \`${guildPreference.getBeginningCutoffYear()}\`.`);
        logger.info(`${getDebugContext(message)} | Cutoff set to ${guildPreference.getBeginningCutoffYear()}`);
    },
    validations: {
        minArgCount: 1,
        maxArgCount: 1,
        arguments: [
            {
                name: 'cutoff',
                type: 'number',
                minValue: BEGINNING_SEARCH_YEAR,
                maxValue: (new Date()).getFullYear()
            }
        ]
    },
    BEGINNING_SEARCH_YEAR
}
