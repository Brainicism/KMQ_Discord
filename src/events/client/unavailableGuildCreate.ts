import { IPCLogger } from "../../logger.js";
import type Eris from "eris";

const logger = new IPCLogger("unavailableGuildCreate");

/**
 * Handles the 'unavailableGuildCreate' event
 * @param guild - the guild object
 */
export default function unavailableGuildCreateHandler(
    guild: Eris.UnavailableGuild,
): void {
    logger.info(`Guild now unavailable. gid = ${guild.id}`);
}
