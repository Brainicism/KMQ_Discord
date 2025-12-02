import { IPCLogger } from "../../logger.js";

const logger = new IPCLogger("shardDisconnect");

/**
 * Handles the 'shardDisconnect' event
 * @param err - The error that caused the disconnect.
 * @param shardID - The shard ID that disconnected.
 */
export default function shardDisconnectHandler(
    err: Error | undefined,
    shardID: number,
): void {
    if (err) {
        logger.warn(`Shard #${shardID} disconnected. err = ${err.message}`);
    } else {
        logger.warn(`Shard #${shardID} disconnected.`);
    }
}
