import _logger from "../../logger";

const logger = _logger("shardResume");

export default function shardResumeHandler(shardID: number) {
    logger.info(`Shard #${shardID} resumed.`);
}
