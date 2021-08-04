import { state } from "../../kmq";
import { IPCLogger } from "../../logger";
import { EnvType } from "../../types";

const logger = new IPCLogger("uncaughtException");

export default function uncaughtExceptionHandler(err: Error) {
    logger.error(`Cluster Uncaught Exception. Reason: ${err}. Trace: ${err.stack}`);
    if (process.env.NODE_ENV === EnvType.CI) {
        state.ipc.admiralBroadcast("abort");
    }
}
