import _logger from "../../logger";

const logger = _logger("shardDisconnect");

export default function shardDisconnectHandler(err: Error, shardID: number) {
    if (err) {
        logger.warn(`Shard #${shardID} disconnected. err = ${err.message}`);
    } else {
        logger.warn(`Shard #${shardID} disconnected.`);
    }
}
