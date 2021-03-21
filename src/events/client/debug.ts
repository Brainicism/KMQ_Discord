import _logger from "../../logger";

const logger = _logger("debug");
export default function debugHandler(message: string, shardID: number) {
    if (shardID) {
        logger.debug(`Shard #${shardID} received debug message: ${message}`);
    } else {
        logger.debug(`Received debug message: ${message}`);
    }
}
