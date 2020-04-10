const { startGame } = require("../helpers/utils.js");

module.exports = {
    call: ({ message, db, gameSession, guildPreference }) => {
        if (!message.member.voiceChannel) {
            message.channel.send("Send `!random` again when you are in a voice channel.");
        }
        else {
            startGame(gameSession, guildPreference, db, message);
        }
    }
}
