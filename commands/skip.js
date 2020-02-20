const { isSkipMajority,disconnectVoiceConnection, sendSkipWarning, sendSkipMessage, startGame } = require("../helpers/utils.js");

module.exports = {
    call: ({ gameSession, client, message, db }) => {
        if (gameSession.gameInSession()) {
            gameSession.userSkipped(message.author);
            if (isSkipMajority(gameSession)) {
                disconnectVoiceConnection(client, message);
                sendSkipMessage(message, gameSession);
                gameSession.endRound();
                startGame(gameSession, db, message);
            }
            else {
                sendSkipWarning(message, gameSession);
            }
        }
    }
}
