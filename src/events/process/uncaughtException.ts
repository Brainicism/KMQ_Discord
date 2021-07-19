import { IPCLogger } from "../../logger";

const logger = new IPCLogger("uncaughtException");

export default function uncaughtExceptionHandler(err: Error) {
    logger.error(`Uncaught Exception. Reason: ${err}. Trace: ${err.stack}`);
}
