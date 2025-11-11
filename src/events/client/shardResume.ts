import { IPCLogger } from "../../logger.js";

const logger = new IPCLogger("shardResume");

/**
 * Handles the 'shardResume' event
 * @param shardID - The shard ID that was resumed
 */
export default function shardResumeHandler(shardID: number): void {
    logger.info(`Shard #${shardID} resumed.`);
}
