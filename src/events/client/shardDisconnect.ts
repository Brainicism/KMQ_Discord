import _logger from "../../logger";

const logger = _logger("shardDisconnect");

export default function shardDisconnectHandler(err: Error, shardId: number) {
    if (err) {
        logger.warn(`Shard #${shardId} disconnected. err = ${err.message}`);
    } else {
        logger.warn(`Shard #${shardId} disconnected.`);
    }
}
