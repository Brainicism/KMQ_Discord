import Eris from "eris";
import { IPCLogger } from "../../logger";

const logger = new IPCLogger("guildAvailable");

export default function guildAvailableHandler(guild: Eris.Guild): void {
    logger.info(`Guild now available. gid = ${guild.id}`);
}
