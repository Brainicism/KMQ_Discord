import _logger from "../../logger";
const logger = _logger("connect");

export default function connectHandler(shardId: number) {
    logger.info(`Shard #${shardId} has connected.`)
}
