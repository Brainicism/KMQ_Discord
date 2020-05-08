const GameSession = require("../models/game_session.js");
const { EMBED_ERROR_COLOR } = require("../helpers/utils.js");
const { startGame } = require("../helpers/utils.js");
const logger = require("../logger")("random");
const getDebugContext = require("../helpers/utils").getDebugContext

module.exports = {
    call: ({ message, db, gameSessions, guildPreference }) => {
        if (!message.member.voice.channel) {
            message.channel.send({
                embed: {
                    color: EMBED_ERROR_COLOR,
                    author: {
                        name: message.author.username,
                        icon_url: message.author.avatarURL()
                    },
                    title: "**Join a voice channel**",
                    description: `Send \`${guildPreference.getBotPrefix()}random\` again when you are in a voice channel.`
                }
            });
            logger.warn(`${getDebugContext(message)} | User not in voice channel`);
        }
        else {
            if (!gameSessions[message.guild.id]) {
                gameSessions[message.guild.id] = new GameSession();
                logger.info(`${getDebugContext(message)} | Game session created`);
            }
            startGame(gameSessions[message.guild.id], guildPreference, db, message);
        }
    }
}
