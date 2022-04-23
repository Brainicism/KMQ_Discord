import type Eris from "eris";
import { IPCLogger } from "../../logger";

const logger = new IPCLogger("guildAvailable");

/**
 * Handles the 'guildAvailable' event
 * @param guild - the guild object
 */
export default function guildAvailableHandler(guild: Eris.Guild): void {
    logger.info(`Guild now available. gid = ${guild.id}`);
}
