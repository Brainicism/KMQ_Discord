import _logger from "../../logger";
import state from "../../kmq";
import { sendEndGameMessage } from "../../helpers/discord_utils";
import dbContext from "../../database_context";

const logger = _logger("SIGINT");

export default async function SIGINTHandler() {
    logger.debug("SIGINT received, cleaning up...");
    for (const guildId of Object.keys(state.gameSessions)) {
        const gameSession = state.gameSessions[guildId];
        await sendEndGameMessage({ channel: gameSession.textChannel }, gameSession);
        logger.debug(`gid: ${guildId} | Forcing game session end`);
        await gameSession.endSession();
    }
    await dbContext.destroy();
    process.exit(0);
}
