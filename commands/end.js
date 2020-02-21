const { sendSongMessage, disconnectVoiceConnection } = require("../helpers/utils.js")
const GREEN = 0x32CD32;

module.exports = {
    call: ({ client, gameSession, message }) => {
        if (!gameSession.scoreboard.isEmpty()) {
            if (gameSession.gameInSession()) {
                sendSongMessage(message, gameSession, true);
            }
            message.channel.send({
                embed: {
                    color: GREEN,
                    title: gameSession.scoreboard.getWinnerMessage()
                }
            });
        }
        else if (gameSession.gameInSession()) {
            message.channel.send({
                embed: {
                    title: "Nobody won :(",
                    color: GREEN
                }
            });
        }
        disconnectVoiceConnection(client, message);
        gameSession.endGame();
    }
}
