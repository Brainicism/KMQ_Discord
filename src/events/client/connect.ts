import { IPCLogger } from "../../logger.js";

const logger = new IPCLogger("connect");

/**
 * Handles the 'connect' event
 * @param shardID - the shard ID
 */
export default function connectHandler(shardID: number): void {
    logger.info(`Shard #${shardID} has connected.`);
}
