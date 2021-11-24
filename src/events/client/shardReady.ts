import { IPCLogger } from "../../logger";

const logger = new IPCLogger("shardReady");

export default function shardReadyHandler(shardID: number): void {
    logger.info(`Shard #${shardID} ready.`);
}
