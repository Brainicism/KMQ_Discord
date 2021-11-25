import Eris from "eris";
import { IPCLogger } from "../../logger";

const logger = new IPCLogger("channelDelete");

/**
 * Handles the 'channelDelete' event
 * @param channel - the channel object
 */
export default function channelDeleteHandler(channel: Eris.Channel): void {
    logger.info(`Channel deleted. id = ${channel.id}`);
}
