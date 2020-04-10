const DEFAULT_LIMIT = 500;
module.exports = {
    call: ({ message, parsedMessage, guildPreference }) => {
        guildPreference.setLimit(parseInt(parsedMessage.components[0]));
        message.channel.send(`The limit is \`${guildPreference.getLimit()}\`.`);
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
