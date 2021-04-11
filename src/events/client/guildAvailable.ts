import Eris from "eris";
import _logger from "../../logger";

const logger = _logger("guildAvailable");

export default async function guildAvailableHandler(guild: Eris.Guild) {
    logger.info(`Guild now available. gid = ${guild.id}`);
}
