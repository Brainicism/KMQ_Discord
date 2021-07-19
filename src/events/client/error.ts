import { IPCLogger } from "../../logger";

const logger = new IPCLogger("error");
export default function errorHandler(err: Error, shardID: number) {
    logger.error(`Shard #${shardID} encountered error: ${err.message}`);
}
