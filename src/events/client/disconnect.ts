import { IPCLogger } from "../../logger";

const logger = new IPCLogger("disconnect");

/**
 * Handles the 'disconnect' event
 */
export default function disconnectHandler(): void {
    logger.info("All shards have disconnected");
}
