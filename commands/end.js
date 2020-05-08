const { sendSongMessage, disconnectVoiceConnection, EMBED_INFO_COLOR } = require("../helpers/utils.js")
const logger = require ("../logger")("end");
const getDebugContext = require("../helpers/utils").getDebugContext
const GREEN = 0x32CD32;

module.exports = {
    call: ({ client, gameSessions, message }) => {
        let gameSession = gameSessions[message.guild.id];
        if (!gameSession) {
            return;
        }
        if (gameSession.gameInSession()) {
            sendSongMessage(message, gameSession, true);
        }

        if (!gameSession.scoreboard.isEmpty()) {
            logger.info(`${getDebugContext(message)} | Game session ended, non-empty`);
            message.channel.send({
                embed: {
                    color: EMBED_INFO_COLOR,
                    title: gameSession.scoreboard.getWinnerMessage()
                }
            });
        }
        else if (gameSession.gameInSession()) {
            logger.info(`${getDebugContext(message)} | Game session ended, empty`);
            message.channel.send({
                embed: {
                    color: EMBED_INFO_COLOR,
                    title: "Nobody won :("
                }
            });
        }
        disconnectVoiceConnection(client, message);
        delete gameSessions[message.guild.id];
    }
}
