import { IPCLogger } from "../../logger";

const logger = new IPCLogger("shardDisconnect");

export default function shardDisconnectHandler(err: Error, shardID: number): void {
    if (err) {
        logger.warn(`Shard #${shardID} disconnected. err = ${err.message}`);
    } else {
        logger.warn(`Shard #${shardID} disconnected.`);
    }
}
