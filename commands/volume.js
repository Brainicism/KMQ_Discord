const DEFAULT_VOLUME = 0.1;
module.exports = {
    call: ({ message, parsedMessage, gameSessions, guildPreference, db }) => {
        guildPreference.setVolume(parseInt(parsedMessage.components[0]), db);
        let gameSession = gameSessions[message.guild.id];
        if (gameSession && gameSession.dispatcher) {
            gameSession.dispatcher.setVolume(guildPreference.getVolume());
        }
        message.channel.send(`The volume is \`${guildPreference.getVolume() * 500}%\`.`);
        // The internal max value volume is 0.2 (for now)
    },
    validations: {
        minArgCount: 1,
        maxArgCount: 1,
        arguments: [
            {
                name: 'volume',
                type: 'number',
                minValue: 1,
                maxValue: 100
            }
        ]
    },
    DEFAULT_VOLUME
}
