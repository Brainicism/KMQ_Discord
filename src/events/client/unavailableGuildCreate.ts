import Eris from "eris";
import _logger from "../../logger";

const logger = _logger("unavailableGuildCreate");

export default async function unavailableGuildCreateHandler(guild: Eris.UnavailableGuild) {
    logger.info(`Guild now unavailable. gid = ${guild.id}`);
}
