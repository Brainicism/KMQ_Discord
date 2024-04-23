import { IPCLogger } from "../../logger";

const logger = new IPCLogger("debug");

/**
 * Handles the 'debug' event
 * @param message - The debug message
 * @param shardID - The shard ID
 */
export default function debugHandler(message: string, shardID: number): void {
    if (shardID) {
        logger.info(`Shard #${shardID} received debug message: ${message}`);
    } else {
        logger.info(`Received debug message: ${message}`);
    }
}
