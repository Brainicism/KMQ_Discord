import BaseCommand, { CommandArgs } from "./base_command";
import { sendSongMessage, getDebugContext } from "../helpers/discord_utils";
import _logger from "../logger";
const logger = _logger("stop");

class StopCommand implements BaseCommand {
    async call({db, gameSessions, message }: CommandArgs) {
        const gameSession = gameSessions[message.guild.id];
        if (gameSession && gameSession.roundIsActive()) {
            logger.info(`${getDebugContext(message)} | Game round ended: ${gameSession.getDebugSongDetails()}`);
            await sendSongMessage(message, gameSession, true);
            await gameSession.endRound(false);
            gameSession.lastActiveNow(db);
        }
    }
    help = {
        name: "stop",
        description: "The game will be suspended and the bot will reveal the answer to any ongoing games in session.",
        usage: "!stop",
        arguments: []
    }
}
export default StopCommand;
