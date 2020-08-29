import _logger from "../../logger";
const logger = _logger("warn");

export default function warn(message: string, shardId: number){
    logger.warn(`Shard #${shardId} encountered warning: ${message}`);
}
