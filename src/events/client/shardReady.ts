import _logger from "../../logger";
const logger = _logger("shardReady");

export default function shardReadyHandler(shardId: number){
    logger.info(`Shard #${shardId} ready.`);
}
