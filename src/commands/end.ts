import BaseCommand, { CommandArgs } from "./base_command";
import { sendEndGameMessage, disconnectVoiceConnection, getDebugContext } from "../helpers/discord_utils";
import _logger from "../logger";
const logger = _logger("end");

export default class EndCommand implements BaseCommand {
    async call({ gameSessions, message }: CommandArgs) {
        const gameSession = gameSessions[message.guildID];
        if (!gameSession) {
            logger.warn(`${getDebugContext(message)} | No active game session`);
            return;
        }
        logger.info(`${getDebugContext(message)} | Game session ended`);
        await sendEndGameMessage({ channel: message.channel, authorId: message.author.id }, gameSession);
        await gameSession.endSession();
        disconnectVoiceConnection(message);
    }
    help = {
        name: "end",
        description: "Finishes the current game and decides on a winner.",
        usage: "!end",
        examples: []
    }
    aliases = ["stop", "e"]
}
