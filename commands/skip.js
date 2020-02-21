const { disconnectVoiceConnection, startGame, sendSongMessage } = require("../helpers/utils.js");
const RED = 0xE74C3C;

module.exports = {
    call: ({ gameSession, client, message, db }) => {
        if (!gameSession.gameInSession()) {
            return;
        }
        gameSession.userSkipped(message.author);
        if (isSkipMajority(gameSession)) {
            sendSongMessage(message, gameSession, false);
            sendSkipMessage(message, gameSession);
            gameSession.endRound();
            startGame(gameSession, db, message);
        }
        else {
            sendSkipNotification(message, gameSession);
        }
    }
}

function sendSkipNotification(message, gameSession) {
    message.channel.send({
        embed: {
            color: RED,
            title: "**Skip**",
            description: `${gameSession.getNumSkippers()}/${Math.floor(gameSession.getNumParticipants() * 0.5) + 1} skips achieved.`
        }
    });
}

function sendSkipMessage(message, gameSession) {
    message.channel.send({
        embed: {
            color: RED,
            title: "**Skip**",
            description: `${gameSession.getNumSkippers()}/${Math.floor(gameSession.getNumParticipants() * 0.5) + 1} skips achieved, skipping...`
        }
    });
}

function isSkipMajority(gameSession) {
    return (gameSession.getNumSkippers() / gameSession.getNumParticipants() >= 0.5);
}
