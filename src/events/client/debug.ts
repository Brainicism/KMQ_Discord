import _logger from "../../logger";

const logger = _logger("debug");
export default function debugHandler(message: string, shardId: number) {
    if (shardId) {
        logger.debug(`Shard #${shardId} received debug message: ${message}`);
    } else {
        logger.debug(`Received debug message: ${message}`);
    }
}
