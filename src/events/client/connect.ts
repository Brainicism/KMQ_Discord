import _logger from "../../logger";
const logger = _logger("connect");

export default function connect(shardId: number) {
    logger.info(`Shard #${shardId} has connected.`)
}
