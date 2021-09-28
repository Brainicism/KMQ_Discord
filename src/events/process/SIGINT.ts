import { IPCLogger } from "../../logger";

const logger = new IPCLogger("SIGINT");

export default async function SIGINTHandler() {
    logger.debug("Catch SIGINT to allow for soft kill");
}
