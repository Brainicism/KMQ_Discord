import _logger from "../../logger";

const logger = _logger("error");
export default function errorHandler(err: Error, shardID: number) {
    logger.error(`Shard #${shardID} encountered error: ${err.message}`);
}
