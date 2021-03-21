import _logger from "../../logger";

const logger = _logger("connect");

export default function connectHandler(shardID: number) {
    logger.info(`Shard #${shardID} has connected.`);
}
