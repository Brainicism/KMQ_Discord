import { IPCLogger } from "../../logger";

const logger = new IPCLogger("warn");
const IGNORED_WARNING_SUBSTRINGS = [
    "Unhandled MESSAGE_CREATE type",
    "Unknown guild text channel type",
];

/**
 * Handles the 'warn' event
 * @param message - The warning message
 * @param shardID - The shard ID
 */
export default function warnHandler(
    message: string | Error,
    shardID: number
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
