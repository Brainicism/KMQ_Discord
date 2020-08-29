import _logger from "../../logger";
const logger = _logger("shardDisconnect");

export default function shardDisconnectHandler(err: Error, shardId: number){
    logger.warn(`Shard #${shardId} disconnected. err = ${err.message}`);
}
