import _logger from "../../logger";
const logger = _logger("error");
export default function errorHandler(err: Error, shardId: number) {
    logger.error(`Shard #${shardId} encountered error: ${err.message}`);

}
