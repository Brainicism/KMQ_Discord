import _logger from "../../logger";

const logger = _logger("disconnect");

export default function disconnectHandler() {
    logger.info("All shards have disconnected");
}
