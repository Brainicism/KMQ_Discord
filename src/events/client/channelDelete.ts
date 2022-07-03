import { IPCLogger } from "../../logger";
import type Eris from "eris";

const logger = new IPCLogger("channelDelete");

/**
 * Handles the 'channelDelete' event
 * @param channel - the channel object
 */
export default function channelDeleteHandler(channel: Eris.Channel): void {
    logger.debug(`Channel deleted. id = ${channel.id}`);
}
