const startGame = require("../utils.js").startGame

module.exports = (message, db, gameSession) => {
    if (!message.member.voiceChannel) {
        message.channel.send("Send `!random` again when you are in a voice channel.");
    }
    else {
        startGame(gameSession, db, message);
    }
}