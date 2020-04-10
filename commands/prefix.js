module.exports = {
    call: ({ message, parsedMessage, guildPreference }) => {
        guildPreference.setBotPrefix(parsedMessage.components[0]);
        message.channel.send(`The prefix is \`${guildPreference.getBotPrefix()}\`.`);
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
    }
}
