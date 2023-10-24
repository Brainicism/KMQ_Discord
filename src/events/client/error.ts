import { IPCLogger } from "../../logger";

const logger = new IPCLogger("error");

/**
 * Handles the 'error' event
 * @param err - The error
 * @param shardID - The shard ID
 */
export default function errorHandler(err: Error, shardID: number): void {
    logger.error(
        `Shard #${shardID} encountered error | Name: ${err.name}. Reason: ${err.message}. Trace: ${err.stack}}`,
    );
}
