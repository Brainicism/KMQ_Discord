import { IPCLogger } from "../../logger";

const logger = new IPCLogger("shardReady");

export default function shardReadyHandler(shardID: number) {
    logger.info(`Shard #${shardID} ready.`);
}
