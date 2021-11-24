import { IPCLogger } from "../../logger";

const logger = new IPCLogger("SIGINT");

export default function SIGINTHandler() : void {
    logger.debug("Catch SIGINT to allow for soft kill");
}
