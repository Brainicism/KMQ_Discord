import _logger from "../../logger";
import state from "../../kmq";
import dbContext from "../../database_context";
import { endSession } from "../../helpers/game_utils";

const logger = _logger("SIGINT");

export default async function SIGINTHandler() {
    logger.debug("SIGINT received, cleaning up...");

    const endSessionPromises = Object.keys(state.gameSessions).map(async (guildID) => {
        const gameSession = state.gameSessions[guildID];
        logger.debug(`gid: ${guildID} | Forcing game session end`);
        await endSession(gameSession);
    });
    await Promise.allSettled(endSessionPromises);
    await dbContext.destroy();
    process.exit(0);
}
