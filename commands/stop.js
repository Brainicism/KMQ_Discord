const { sendSongMessage, disconnectVoiceConnection } = require("../helpers/utils.js");

module.exports = ({ gameSession, client, message }) => {
    if (gameSession.gameInSession()) {
        sendSongMessage(message, gameSession, true);
        disconnectVoiceConnection(client, message);
        gameSession.endRound();
    }
}