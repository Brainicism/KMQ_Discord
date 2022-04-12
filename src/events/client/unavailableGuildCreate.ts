import Eris from "eris";
import { IPCLogger } from "../../logger";

const logger = new IPCLogger("unavailableGuildCreate");

/**
 * Handles the 'unavailableGuildCreate' event
 * @param guild - the guild object
 */
export default function unavailableGuildCreateHandler(
    guild: Eris.UnavailableGuild
): void {
    logger.info(`Guild now unavailable. gid = ${guild.id}`);
}
