import _logger from "../../logger";
const logger = _logger("shardResume");

export default function shardResume(shardId: number){
    logger.info(`Shard #${shardId} resumed.`);
}
