import { IPCLogger } from "../../logger";

const logger = new IPCLogger("unhandledRejection");

export default function unhandledRejectionHandler(reason: Error, p: Promise<any>) {
    logger.error(`Unhandled Rejection at: Promise ${p}. Reason: ${reason}. Trace: ${reason.stack}`);
}
