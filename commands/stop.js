const sendSongMessage = require("../utils.js").sendSongMessage
const disconnectVoiceConnection = require("../utils.js").disconnectVoiceConnection

module.exports = (gameSession, client, message) => {
    if (gameSession.gameInSession()) {
        sendSongMessage(message, gameSession, true);
        disconnectVoiceConnection(client, message);
        gameSession.endRound();
    }
}