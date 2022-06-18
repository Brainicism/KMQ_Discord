import { IPCLogger } from "../../logger";
import State from "../../state";

const logger = new IPCLogger("SIGINT");

/**
 * Handles the 'SIGINT' event
 */
export default async function SIGINTHandler(): Promise<void> {
    logger.debug("Catch SIGINT to allow for soft kill");
    logger.info("Saving to central store");
}
