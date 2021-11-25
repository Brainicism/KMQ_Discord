import { IPCLogger } from "../../logger";

const logger = new IPCLogger("warn");

/**
 * Handles the 'warn' event
 * @param message - The warning message
 * @param shardID - The shard ID
 */
export default function warnHandler(message: string, shardID: number): void {
    logger.warn(`Shard #${shardID} encountered warning: ${message}`);
}
