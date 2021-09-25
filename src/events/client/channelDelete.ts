import Eris from "eris";
import { IPCLogger } from "../../logger";

const logger = new IPCLogger("channelDelete");

export default async function channelDeleteHandler(channel: Eris.Channel) {
    logger.info(`Channel deleted. id = ${channel.id}`);
}
