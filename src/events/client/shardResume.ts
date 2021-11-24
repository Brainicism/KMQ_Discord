import { IPCLogger } from "../../logger";

const logger = new IPCLogger("shardResume");

export default function shardResumeHandler(shardID: number): void {
    logger.info(`Shard #${shardID} resumed.`);
}
