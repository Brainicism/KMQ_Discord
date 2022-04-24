import { IPCLogger } from "../../logger";
import EnvType from "../../enums/env_type";
import State from "../../state";

const logger = new IPCLogger("unhandledRejection");

/**
 * Handles the 'unhandledRejection' event
 * @param reason - Error object
 */
export default function unhandledRejectionHandler(reason: Error): void {
    logger.error(
        `Cluster Unhandled Rejection at: Reason: ${reason}. Trace: ${reason.stack}`
    );
    if (process.env.NODE_ENV === EnvType.CI) {
        State.ipc.sendToAdmiral("abort");
    }
}
