module.exports = {
    call: ({ message, parsedMessage, gameSession }) => {
        gameSession.setBotPrefix(parsedMessage.components[0]);
        message.channel.send(`The prefix is \`${gameSession.getBotPrefix()}\`.`);
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
