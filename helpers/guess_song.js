const { sendScoreboard, sendSongMessage, disconnectVoiceConnection, getUserIdentifier, cleanSongName, startGame } = require("./utils.js");

module.exports = ({ client, message, gameSession, db }) => {
    let guess = cleanSongName(message.content);
    if (gameSession.getSong() && guess === cleanSongName(gameSession.getSong())) {
        // this should be atomic
        let userTag = getUserIdentifier(message.author);
        gameSession.scoreboard.updateScoreboard(userTag, message.author.id);
        sendSongMessage(message, gameSession, false);
        sendScoreboard(message, gameSession);
        gameSession.endRound();
        startGame(gameSession, db, message);
    }
}

