const { sendSongMessage, getUserIdentifier, cleanSongName, startGame, getDebugContext } = require("./utils");
const logger = require("../logger")("guess_song");
const resolve = require("path").resolve

export default ({ client, message, gameSessions, guildPreference, db }) => {
    let guess = cleanSongName(message.content);
    let gameSession = gameSessions[message.guild.id];
    if (gameSession.getSong() && guess === cleanSongName(gameSession.getSong())) {
        // this should be atomic
        let userTag = getUserIdentifier(message.author);
        gameSession.scoreboard.updateScoreboard(userTag, message.author.id);
        sendSongMessage(message, gameSession, false);
        logger.info(`${getDebugContext(message)} | Song correctly guessed. song = ${gameSession.getSong()}`)
        gameSession.endRound();
        if (gameSession.connection) {
            gameSession.connection.play(resolve("assets/ring.wav"));
        }
        setTimeout(() => {
            startGame(gameSession, guildPreference, db, message, client);
        }, 2000);
    }
}

