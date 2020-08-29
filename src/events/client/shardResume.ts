import _logger from "../../logger";
const logger = _logger("shardResume");

export default function shardResumeHandler(shardId: number){
    logger.info(`Shard #${shardId} resumed.`);
}
