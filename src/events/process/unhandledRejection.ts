import _logger from "../../logger";

const logger = _logger("unhandledRejection");

export default function unhandledRejectionHandler(reason: Error, p: Promise<any>) {
    logger.error(`Unhandled Rejection at: Promise ${p}. Reason: ${reason}. Trace: ${reason.stack}`);
}
