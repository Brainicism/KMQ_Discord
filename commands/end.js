const { sendSongMessage, disconnectVoiceConnection } = require("../helpers/utils.js")
const GREEN = 0x32CD32;

module.exports = {
    call: ({ client, gameSessions, message }) => {
        let gameSession = gameSessions[message.guild.id];
        if (!gameSession) {
            return;
        }
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
        delete gameSessions[message.guild.id];
    }
}
