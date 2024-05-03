import { IPCLogger } from "../../logger";
import { extractErrorString } from "../../helpers/utils";

const logger = new IPCLogger("error");

/**
 * Handles the 'error' event
 * @param err - The error
 * @param shardID - The shard ID
 */
export default function errorHandler(err: Error, shardID: number): void {
    const knownErrors = [
        "Connection reset by peer",
        "Server didn't acknowledge previous heartbeat",
        "1001: CloudFlare WebSocket proxy restarting",
        "Invalid WebSocket frame",
        "Not authenticated",
        "CloudFlare WebSocket proxy restarting",
    ];

    let error = true;
    if (knownErrors.some((knownError) => err.message.includes(knownError))) {
        error = false;
    }

    const message = extractErrorString(err);

    if (error) {
        logger.error(`Shard #${shardID} encountered error | ${message}`);
    } else {
        logger.warn(`Shard #${shardID} encountered error | ${message}`);
    }
}
