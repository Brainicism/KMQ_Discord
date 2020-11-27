import heapdump from "heapdump";
import BaseCommand, { CommandArgs } from "../base_command";
import { getDebugChannel, getDebugContext, sendErrorMessage, sendInfoMessage } from "../../helpers/discord_utils";
import _logger from "../../logger";

const logger = _logger("snapshot");

export default class SnapshotCommand implements BaseCommand {
    async call({ message }: CommandArgs) {
        const kmqDebugChannel = getDebugChannel();
        if (!kmqDebugChannel || message.channel.id !== kmqDebugChannel.id) {
            sendErrorMessage(message, "Error", "You are not allowed to snapshot in this channel");
            logger.warn(`${getDebugContext(message)} | Attempted to snapshot in non-debug channel`);
            return;
        }
        await sendInfoMessage(message, "Heap Snapshot Starting", "beep boop");
        logger.info(`${getDebugContext(message)} | Heap snapshot beginning`);
        heapdump.writeSnapshot((err, filename) => {
            if (err) {
                logger.error(err);
            } else {
                sendInfoMessage(message, "Heap Snapshot Complete", filename);
                logger.info(`${getDebugContext(message)} | Heap snapshot finished`);
            }
        });
    }
}
