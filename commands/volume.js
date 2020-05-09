const { sendInfoMessage } = require("../helpers/utils.js");
const DEFAULT_VOLUME = 50;
const logger = require("../logger")("volume");
const getDebugContext = require("../helpers/utils").getDebugContext

module.exports = {
    call: ({ message, parsedMessage, gameSessions, guildPreference, db }) => {
        guildPreference.setVolume(parseInt(parsedMessage.components[0]), db);
        let gameSession = gameSessions[message.guild.id];
        if (gameSession && gameSession.dispatcher) {
            gameSession.dispatcher.setVolume(
                gameSession.isSongCached ? guildPreference.getCachedStreamVolume() : guildPreference.getStreamVolume()
            );
        }
        sendInfoMessage(message,
            "Volume",
            `The volume is \`${guildPreference.getVolume()}%\`.`
        );
        logger.info(`${getDebugContext(message)} | Volume set to ${guildPreference.getVolume()}. cached = ${gameSession.isSongCached}`);
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
