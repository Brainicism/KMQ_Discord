import _logger from "../../logger";
const logger = _logger("shardReady");

export default function shardReady(shardId: number){
    logger.info(`Shard #${shardId} ready.`);
}
