const { sendScoreboard, sendSongMessage, disconnectVoiceConnection, getUserIdentifier, cleanSongName } = require("./utils.js");

module.exports = ({ client, message, gameSession }) => {
    let guess = cleanSongName(message.content);
    if (gameSession.getSong() && guess === cleanSongName(gameSession.getSong())) {
        // this should be atomic
        let userTag = getUserIdentifier(message.author);
        gameSession.scoreboard.updateScoreboard(userTag, message.author.id);
        sendSongMessage(message, gameSession, false);
        sendScoreboard(message, gameSession);
        disconnectVoiceConnection(client, message);
        gameSession.endRound();
    }
}

