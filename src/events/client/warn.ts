import { IPCLogger } from "../../logger";

const logger = new IPCLogger("warn");

export default function warnHandler(message: string, shardID: number) {
    logger.warn(`Shard #${shardID} encountered warning: ${message}`);
}
