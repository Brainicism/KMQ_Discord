import { IPCLogger } from "../../logger";

const logger = new IPCLogger("connect");

export default function connectHandler(shardID: number) {
    logger.info(`Shard #${shardID} has connected.`);
}
