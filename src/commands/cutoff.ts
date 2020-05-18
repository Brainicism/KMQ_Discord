const { sendOptionsMessage, GameOptions, getDebugContext } = require("../helpers/utils");
const BEGINNING_SEARCH_YEAR = 2008;
const logger = require("../logger")("cutoff");


function call({ message, parsedMessage, guildPreference, db }) {
    guildPreference.setBeginningCutoffYear(parseInt(parsedMessage.components[0]), db);
    sendOptionsMessage(message, guildPreference, db, GameOptions.CUTOFF);
    logger.info(`${getDebugContext(message)} | Cutoff set to ${guildPreference.getBeginningCutoffYear()}`);
}
const validations = {
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
}
const help = {
    name: "cutoff",
    description: "Set a cutoff year for songs. Only songs released during and after the cutoff year will be chosen.",
    usage: "!cutoff [year]",
    arguments: [
        {
            name: "year",
            description: "Songs typically range from 2008 to 2018."
        }
    ]
}
BEGINNING_SEARCH_YEAR

export {
    call,
    validations,
    help,
    BEGINNING_SEARCH_YEAR
}

