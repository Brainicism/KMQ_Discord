import { IPCLogger } from "../../logger";
import { extractErrorString } from "../../helpers/utils";
import EnvType from "../../enums/env_type";
import State from "../../state";

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
