import { IPCLogger } from "../../logger";

const logger = new IPCLogger("disconnect");

export default function disconnectHandler() {
    logger.info("All shards have disconnected");
}
