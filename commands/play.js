const GameSession = require("../models/game_session.js");
const { sendErrorMessage, startGame, getDebugContext } = require("../helpers/utils.js");
const logger = require("../logger")("play");

module.exports = {
    call: ({ message, db, gameSessions, guildPreference, client }) => {
        if (!message.member.voice.channel) {
            sendErrorMessage(message,
                "Join a voice channel",
                `Send \`${guildPreference.getBotPrefix()}play\` again when you are in a voice channel.`);
            logger.warn(`${getDebugContext(message)} | User not in voice channel`);
        }
        else {
            if (!gameSessions[message.guild.id]) {
                gameSessions[message.guild.id] = new GameSession();
                logger.info(`${getDebugContext(message)} | Game session created`);
            }
            startGame(gameSessions[message.guild.id], guildPreference, db, message, client);
        }
    },
    aliases: ["random"]
}
