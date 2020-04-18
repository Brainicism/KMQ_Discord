const DEFAULT_VOLUME = 50;
module.exports = {
    call: ({ message, parsedMessage, gameSessions, guildPreference, db }) => {
        guildPreference.setVolume(parseInt(parsedMessage.components[0]), db);
        let gameSession = gameSessions[message.guild.id];
        if (gameSession && gameSession.dispatcher) {
            gameSession.dispatcher.setVolume(
            gameSession.isSongCached ? guildPreference.getCachedStreamVolume() : guildPreference.getStreamVolume()
        );
        }
        message.channel.send(`The volume is \`${guildPreference.getVolume()}%\`.`);
    },
    validations: {
        minArgCount: 1,
        maxArgCount: 1,
        arguments: [
            {
                name: 'volume',
                type: 'number',
                minValue: 0,
                maxValue: 100
            }
        ]
    },
    DEFAULT_VOLUME
}
