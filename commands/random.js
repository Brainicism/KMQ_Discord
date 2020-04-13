const GameSession = require("../models/game_session.js");
const { startGame } = require("../helpers/utils.js");

module.exports = {
    call: ({ message, db, gameSessions, guildPreference }) => {
        if (!message.member.voiceChannel) {
            message.channel.send(`Send \`${guildPreference.getBotPrefix()}random\` again when you are in a voice channel.`);
        }
        else {
            if (!gameSessions[message.guild.id]) {
                gameSessions[message.guild.id] = new GameSession();
            }
            startGame(gameSessions[message.guild.id], guildPreference, db, message);
        }
    }
}
