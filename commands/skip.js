const {
    disconnectVoiceConnection,
    startGame,
    sendSongMessage,
    areUserAndBotInSameVoiceChannel,
    getNumParticipants } = require("../helpers/utils.js");
const RED = 0xE74C3C;

module.exports = {
    call: ({ gameSession, client, message, db }) => {
        if (!gameSession.gameInSession() || !areUserAndBotInSameVoiceChannel(message)) {
            return;
        }
        gameSession.userSkipped(message.author);
        if (isSkipMajority(message, gameSession)) {
            sendSkipMessage(message, gameSession);
            sendSongMessage(message, gameSession, false);
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
            description: `${gameSession.getNumSkippers()}/${getSkipsRequired(message)} skips received.`
        }
    });
}

function sendSkipMessage(message, gameSession) {
    message.channel.send({
        embed: {
            color: RED,
            title: "**Skip**",
            description: `${gameSession.getNumSkippers()}/${getSkipsRequired(message)} skips achieved, skipping...`
        }
    });
}

function isSkipMajority(message, gameSession) {
    return gameSession.getNumSkippers() >= getSkipsRequired(message);
}

function getSkipsRequired(message) {
    return Math.floor(getNumParticipants(message) * 0.5) + 1;
}
