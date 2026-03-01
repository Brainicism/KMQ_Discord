import { IPCLogger } from "../../logger.js";
import { extractErrorString } from "../../helpers/utils.js";
import EnvType from "../../enums/env_type.js";
import State from "../../state.js";

const logger = new IPCLogger("uncaughtException");

/**
 * Handles the 'uncaughtException' event
 * @param err - Error object
 */
export default function uncaughtExceptionHandler(err: Error): void {
    logger.error(`Cluster Uncaught Exception | ${extractErrorString(err)}`);
    if (process.env.NODE_ENV === EnvType.CI) {
        State.ipc.sendToAdmiral("abort");
    }
}
