import BaseCommand, { CommandArgs } from "../interfaces/base_command";
import { getDebugLogHeader } from "../../helpers/discord_utils";
import _logger from "../../logger";
import { endSession } from "../../helpers/game_utils";

const logger = _logger("end");

export default class EndCommand implements BaseCommand {
    inGameOnly = true;

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
        endSession(gameSession);
    };
}
