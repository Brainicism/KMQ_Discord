import BaseCommand, { CommandArgs } from "./base_command";
import { sendEndGameMessage, disconnectVoiceConnection, sendInfoMessage, getDebugContext } from "../helpers/discord_utils";
import _logger from "../logger";
const logger = _logger("end");

export default class EndCommand implements BaseCommand {
    async call({ gameSessions, message }: CommandArgs) {
        const gameSession = gameSessions[message.guildID];
        if (!gameSession || !gameSession.gameRound) {
            return;
        }
        logger.info(`${getDebugContext(message)} | Game session ended`);
        sendEndGameMessage(message, gameSession);
        await gameSession.endSession(gameSessions);
        disconnectVoiceConnection(message);
    }
    help = {
        name: "end",
        description: "Finishes the current game and decides on a winner.",
        usage: "!end",
        arguments: []
    }
}
