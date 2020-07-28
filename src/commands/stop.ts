import BaseCommand, { CommandArgs } from "./base_command";
import { sendSongMessage, disconnectVoiceConnection, getDebugContext } from "../helpers/discord_utils";
import _logger from "../logger";
const logger = _logger("stop");

class StopCommand implements BaseCommand {
    async call({ gameSessions, client, message }: CommandArgs) {
        let gameSession = gameSessions[message.guild.id];
        if (gameSession && gameSession.gameInSession()) {
            logger.info(`${getDebugContext(message)} | Game round ended: ${gameSession.getDebugSongDetails()}`);
            await sendSongMessage(message, gameSession, true);
            await gameSession.endRound();
            gameSession.lastActive = Date.now();
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
