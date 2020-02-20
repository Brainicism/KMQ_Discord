const { sendSongMessage, disconnectVoiceConnection, sendScoreboard } = require("../helpers/utils.js")

module.exports = {
    call: ({ client, gameSession, message }) => {
        if (!gameSession.scoreboard.isEmpty()) {
            if (gameSession.gameInSession()) {
                sendSongMessage(message, gameSession, true);
            }
            message.channel.send(gameSession.scoreboard.getWinnerMessage());
            sendScoreboard(message, gameSession);
        }
        else {
            message.channel.send("Nobody won :(");
        }
        disconnectVoiceConnection(client, message);
        gameSession.endGame();
    }
}