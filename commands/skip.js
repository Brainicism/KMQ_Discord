const {
    disconnectVoiceConnection,
    startGame,
    sendSongMessage,
    areUserAndBotInSameVoiceChannel,
    getNumParticipants } = require("../helpers/utils.js");
const RED = 0xE74C3C;

module.exports = {
    call: ({ gameSessions, guildPreference, client, message, db }) => {
        let gameSession = gameSessions[message.guild.id];
        if (!gameSession || !gameSession.gameInSession() || !areUserAndBotInSameVoiceChannel(message)) {
            return;
        }
        gameSession.userSkipped(message.author);
        if (isSkipMajority(message, gameSession)) {
            sendSkipMessage(message, gameSession);
            sendSongMessage(message, gameSession, true);
            gameSession.endRound();
            startGame(gameSession, guildPreference, db, message);
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
            author: {
                name: message.author.username,
                icon_url: message.author.avatarURL
            },
            title: "**Skip**",
            description: `${gameSession.getNumSkippers()}/${getSkipsRequired(message)} skips received.`
        }
    })
    .then((message) => message.delete(5000));
}

function sendSkipMessage(message, gameSession) {
    message.channel.send({
        embed: {
            color: RED,
            author: {
                name: message.author.username,
                icon_url: message.author.avatarURL

            },
            title: "**Skip**",
            description: `${gameSession.getNumSkippers()}/${getSkipsRequired(message)} skips achieved, skipping...`
        }
    })
    .then((message) => message.delete(5000));
}

function isSkipMajority(message, gameSession) {
    return gameSession.getNumSkippers() >= getSkipsRequired(message);
}

function getSkipsRequired(message) {
    return Math.floor(getNumParticipants(message) * 0.5) + 1;
}
