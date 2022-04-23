import State from "../../state";
import { IPCLogger } from "../../logger";
import { EnvType } from "../../enums/env_type";

const logger = new IPCLogger("uncaughtException");

/**
 * Handles the 'uncaughtException' event
 * @param err - Error object
 */
export default function uncaughtExceptionHandler(err: Error): void {
    logger.error(
        `Cluster Uncaught Exception. Reason: ${err}. Trace: ${err.stack}`
    );
    if (process.env.NODE_ENV === EnvType.CI) {
        State.ipc.admiralBroadcast("abort");
    }
}
