import Eris from "eris";
import { IPCLogger } from "../../logger";

const logger = new IPCLogger("guildAvailable");

export default async function guildAvailableHandler(guild: Eris.Guild) {
    logger.info(`Guild now available. gid = ${guild.id}`);
}
