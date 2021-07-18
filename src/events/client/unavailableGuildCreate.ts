import Eris from "eris";
import { IPCLogger } from "../../logger";

const logger = new IPCLogger("unavailableGuildCreate");

export default async function unavailableGuildCreateHandler(guild: Eris.UnavailableGuild) {
    logger.info(`Guild now unavailable. gid = ${guild.id}`);
}
