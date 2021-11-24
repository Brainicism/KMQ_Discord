import { IPCLogger } from "../../logger";

const logger = new IPCLogger("debug");
export default function debugHandler(message: string, shardID: number): void {
    if (shardID) {
        logger.debug(`Shard #${shardID} received debug message: ${message}`);
    } else {
        logger.debug(`Received debug message: ${message}`);
    }
}
