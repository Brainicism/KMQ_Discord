import { IPCLogger } from "../../logger.js";
import { extractErrorString } from "../../helpers/utils.js";
import EnvType from "../../enums/env_type.js";
import State from "../../state.js";

const logger = new IPCLogger("unhandledRejection");

/**
 * Handles the 'unhandledRejection' event
 * @param err - Error object
 */
export default function unhandledRejectionHandler(err: Object): void {
    let message: string;
    if (typeof err === "string") {
        message = err;
    } else if (err instanceof Error) {
        message = extractErrorString(err);
    } else {
        logger.warn(
            `Unexpected parameter passed into unhandledRejectionHandler: ${err.constructor.name}}`,
        );
        message = JSON.stringify(err);
    }

    logger.error(`Cluster Unhandled Rejection | ${message}`);
    if (process.env.NODE_ENV === EnvType.CI) {
        State.ipc.sendToAdmiral("abort");
    }
}
