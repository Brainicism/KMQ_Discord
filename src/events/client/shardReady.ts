import { IPCLogger } from "../../logger.js";

const logger = new IPCLogger("shardReady");

/**
 * Handles the 'shardReady' event
 * @param shardID - The shard ID that is ready
 */
export default function shardReadyHandler(shardID: number): void {
    logger.info(`Shard #${shardID} ready.`);
}
