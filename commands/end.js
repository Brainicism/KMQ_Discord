const { sendSongMessage, disconnectVoiceConnection, sendInfoMessage } = require("../helpers/utils.js")
const logger = require ("../logger")("end");
const getDebugContext = require("../helpers/utils").getDebugContext

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
            sendInfoMessage(message, gameSession.scoreboard.getWinnerMessage())
        }
        else if (gameSession.gameInSession()) {
            logger.info(`${getDebugContext(message)} | Game session ended, empty`);
            sendInfoMessage(message, "Nobody won :(")
        }
        disconnectVoiceConnection(client, message);
        delete gameSessions[message.guild.id];
    }
}
