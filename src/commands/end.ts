import BaseCommand, { CommandArgs } from "./base_command";
import { sendSongMessage, disconnectVoiceConnection, sendInfoMessage, getDebugContext } from "../helpers/discord_utils";
import _logger from "../logger";
const logger = _logger("end");

class EndCommand implements BaseCommand {
    async call({ client, gameSessions, message }: CommandArgs) {
        let gameSession = gameSessions[message.guild.id];
        if (!gameSession) {
            return;
        }
        if (gameSession.gameInSession()) {
            await sendSongMessage(message, gameSession, true);
        }
        if (!gameSession.scoreboard.isEmpty()) {
            logger.info(`${getDebugContext(message)} | Game session ended, non-empty`);
            await sendInfoMessage(message, gameSession.scoreboard.getWinnerMessage())
        }
        else if (gameSession.gameInSession()) {
            logger.info(`${getDebugContext(message)} | Game session ended, empty`);
            await sendInfoMessage(message, "Nobody won :(")
        }
        await gameSession.endRound();
        disconnectVoiceConnection(client, message);
        gameSession.finished = true;
        delete gameSessions[message.guild.id];
    }
    help = {
        name: "end",
        description: "Finishes the current game and decides on a winner.",
        usage: "!end",
        arguments: []
    }
}

export default EndCommand;
