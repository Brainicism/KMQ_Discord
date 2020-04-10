const { sendSongMessage, disconnectVoiceConnection } = require("../helpers/utils.js");

module.exports = {
    call: ({ gameSessions, client, message }) => {
        let gameSession = gameSessions[message.guild.id];
        if (gameSession.gameInSession()) {
            sendSongMessage(message, gameSession, true);
            disconnectVoiceConnection(client, message);
            gameSession.endRound();
        }
    }
}
