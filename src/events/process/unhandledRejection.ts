import { state } from "../../kmq_worker";
import { IPCLogger } from "../../logger";
import { EnvType } from "../../types";

const logger = new IPCLogger("unhandledRejection");

/**
 * Handles the 'unhandledRejection' event
 * @param reason - Error object
 */
export default function unhandledRejectionHandler(reason: Error): void {
    logger.error(`Cluster Unhandled Rejection at: Reason: ${reason}. Trace: ${reason.stack}`);
    if (process.env.NODE_ENV === EnvType.CI) {
        state.ipc.admiralBroadcast("abort");
    }
}
