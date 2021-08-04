import { state } from "../../kmq";
import { IPCLogger } from "../../logger";
import { EnvType } from "../../types";

const logger = new IPCLogger("unhandledRejection");

export default function unhandledRejectionHandler(reason: Error) {
    logger.error(`Cluster Unhandled Rejection at: Reason: ${reason}. Trace: ${reason.stack}`);
    if (process.env.NODE_ENV === EnvType.CI) {
        state.ipc.admiralBroadcast("abort");
    }
}
