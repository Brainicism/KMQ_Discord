import { IPCLogger } from "../../logger";

const logger = new IPCLogger("SIGINT");

/**
 * Handles the 'SIGINT' event
 */
export default function SIGINTHandler(): void {
    logger.info("Catch SIGINT to allow for soft kill");
}
