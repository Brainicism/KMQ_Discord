import { IPCLogger } from "../../logger";

const logger = new IPCLogger("SIGINT");

/**
 * Handles the 'SIGINT' event
 */
export default function SIGINTHandler(): void {
    logger.debug("Catch SIGINT to allow for soft kill");
}
