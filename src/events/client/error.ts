import { IPCLogger } from "../../logger";
import { extractErrorString } from "../../helpers/utils";

const logger = new IPCLogger("error");

/**
 * Handles the 'error' event
 * @param err - The error
 * @param shardID - The shard ID
 */
export default function errorHandler(err: Error, shardID: number): void {
    let message: string;
    let error = true;
    if (err.message.includes("Connection reset by peer")) {
        message = "Connection reset by peer";
        error = false;
    } else if (err.message.includes("1001:")) {
        message = "CloudFlare WebSocket proxy restarting";
        error = false;
    } else {
        message = extractErrorString(err);
    }

    if (error) {
        logger.error(`Shard #${shardID} encountered error | ${message}`);
    } else {
        logger.warn(`Shard #${shardID} encountered error | ${message}`);
    }
}
