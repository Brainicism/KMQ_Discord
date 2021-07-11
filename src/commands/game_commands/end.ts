import { CommandArgs } from "../interfaces/base_command";
import { getDebugLogHeader } from "../../helpers/discord_utils";
import _logger from "../../logger";
import InGameCommand from "../interfaces/ingame_command";

const logger = _logger("end");

export default class EndCommand extends InGameCommand {
    help = {
        name: "end",
        description: "Finishes the current game and decides on a winner.",
        usage: ",end",
        examples: [],
        priority: 1020,
    };

    aliases = ["stop", "e"];

    call = async ({ gameSessions, message }: CommandArgs) => {
        const gameSession = gameSessions[message.guildID];
        if (!gameSession) {
            logger.warn(`${getDebugLogHeader(message)} | No active game session`);
            return;
        }

        logger.info(`${getDebugLogHeader(message)} | Game session ended`);
        gameSession.endSession();
    };
}
