import { IGNORED_WARNING_SUBSTRINGS } from "../../constants";
import { IPCLogger } from "../../logger";

const logger = new IPCLogger("warn");

/**
 * Handles the 'warn' event
 * @param message - The warning message
 * @param shardID - The shard ID
 */
export default function warnHandler(
    message: string | Error,
    shardID: number,
): void {
    // ignore warnings meant for the library developers
    if (
        IGNORED_WARNING_SUBSTRINGS.some((warningSubstring) => {
            if (message instanceof Error) {
                return message.message.includes(warningSubstring);
            }

            return message.includes(warningSubstring);
        })
    ) {
        return;
    }

    logger.warn(`Shard #${shardID} encountered warning: ${message}`);
}
