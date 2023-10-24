import { IPCLogger } from "../../logger";
import EnvType from "../../enums/env_type";
import State from "../../state";

const logger = new IPCLogger("unhandledRejection");

/**
 * Handles the 'unhandledRejection' event
 * @param err - Error object
 */
export default function unhandledRejectionHandler(err: Error): void {
    logger.error(
        `Cluster Unhandled Rejection | Name: ${err.name}. Reason: ${
            err.message
        }. Trace: ${err.stack}}. Object: ${JSON.stringify(err)}`
    );
    if (process.env.NODE_ENV === EnvType.CI) {
        State.ipc.sendToAdmiral("abort");
    }
}
