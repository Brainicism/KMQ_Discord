const {
    disconnectVoiceConnection,
    startGame,
    sendSongMessage,
    areUserAndBotInSameVoiceChannel,
    getNumParticipants,
    EMBED_INFO_COLOR,
    getDebugContext } = require("../helpers/utils.js");
const logger = require("../logger")("skip");

module.exports = {
    call: ({ gameSessions, guildPreference, client, message, db }) => {
        let gameSession = gameSessions[message.guild.id];
        if (!gameSession || !gameSession.gameInSession() || !areUserAndBotInSameVoiceChannel(message)) {
            logger.warn(`${getDebugContext(message)} | Invalid skip. !gameSession: ${!gameSession}. !gameSession.gameInSession(): ${!gameSession.gameInSession()}. areUserAndBotInSameVoiceChannel: ${!areUserAndBotInSameVoiceChannel(message)}`);
            return;
        }
        gameSession.userSkipped(message.author);
        if (isSkipMajority(message, gameSession)) {
            sendSkipMessage(message, gameSession);
            sendSongMessage(message, gameSession, true);
            gameSession.endRound();
            startGame(gameSession, guildPreference, db, message, client);
            logger.info(`${getDebugContext(message)} | Skip majority achieved.`);
        }
        else {
            sendSkipNotification(message, gameSession);
            logger.info(`${getDebugContext(message)} | Skip vote received.`);
        }
    }
}

function sendSkipNotification(message, gameSession) {
    message.channel.send({
        embed: {
            color: EMBED_INFO_COLOR,
            author: {
                name: message.author.username,
                icon_url: message.author.avatarURL()
            },
            title: "**Skip**",
            description: `${gameSession.getNumSkippers()}/${getSkipsRequired(message)} skips received.`
        }
    })
        .then((message) => message.delete({ timeout: 5000 }));
}

function sendSkipMessage(message, gameSession) {
    message.channel.send({
        embed: {
            color: EMBED_INFO_COLOR,
            author: {
                name: message.author.username,
                icon_url: message.author.avatarURL()

            },
            title: "**Skip**",
            description: `${gameSession.getNumSkippers()}/${getSkipsRequired(message)} skips achieved, skipping...`
        }
    })
        .then((message) => message.delete({ timeout: 5000 }));
}

function isSkipMajority(message, gameSession) {
    return gameSession.getNumSkippers() >= getSkipsRequired(message);
}

function getSkipsRequired(message) {
    return Math.floor(getNumParticipants(message) * 0.5) + 1;
}
