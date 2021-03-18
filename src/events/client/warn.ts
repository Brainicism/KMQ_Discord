import _logger from "../../logger";

const logger = _logger("warn");

export default function warnHandler(message: string, shardID: number) {
    logger.warn(`Shard #${shardID} encountered warning: ${message}`);
}
