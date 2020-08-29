import _logger from "../../logger";
const logger = _logger("uncaughtException");

export default function uncaughtExceptionHandler(err: Error) {
    logger.error(`Uncaught Exception. Reason: ${err}. Trace: ${err.stack}`);
}
