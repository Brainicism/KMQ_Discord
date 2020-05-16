const { sendSongMessage, disconnectVoiceConnection, sendInfoMessage, getDebugContext } = require("../helpers/utils.js")
const logger = require ("../logger")("end");

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
        gameSession.finished = true;
        delete gameSessions[message.guild.id];
    }
}
