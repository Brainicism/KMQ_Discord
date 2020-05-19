import { CommandArgs } from "commands/base_command";
import { resolve } from "path"
import { sendSongMessage, getUserIdentifier, cleanSongName, startGame, getDebugContext } from "./utils";
import _logger from "../logger";
const logger = _logger("guess_song");

export default ({ client, message, gameSessions, guildPreference, db }: CommandArgs) => {
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

