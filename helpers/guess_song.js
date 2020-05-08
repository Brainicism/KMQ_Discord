const { sendSongMessage, getUserIdentifier, cleanSongName, startGame, getDebugContext } = require("./utils.js");
const logger = require("../logger")("guess_song");

module.exports = ({ client, message, gameSessions, guildPreference, db }) => {
    let guess = cleanSongName(message.content);
    let gameSession = gameSessions[message.guild.id];
    if (gameSession.getSong() && guess === cleanSongName(gameSession.getSong())) {
        // this should be atomic
        let userTag = getUserIdentifier(message.author);
        gameSession.scoreboard.updateScoreboard(userTag, message.author.id);
        sendSongMessage(message, gameSession, false);
        logger.info(`${getDebugContext(message)} | Song correctly guessed. song = ${gameSession.getSong()}`)
        gameSession.endRound();
        startGame(gameSession, guildPreference, db, message);
    }
}

