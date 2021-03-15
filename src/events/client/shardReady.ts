import _logger from "../../logger";

const logger = _logger("shardReady");

export default function shardReadyHandler(shardID: number) {
    logger.info(`Shard #${shardID} ready.`);
}
