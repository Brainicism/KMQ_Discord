import _logger from "../../logger";
import { registerCommands } from "../../helpers/management_utils";
import BaseCommand, { CommandArgs } from "../base_command";
import { getDebugChannel, getDebugLogHeader, getMessageContext, sendErrorMessage, sendInfoMessage } from "../../helpers/discord_utils";

const logger = _logger("reload");

export default class EvalCommand implements BaseCommand {
    async call({ message }: CommandArgs) {
        const kmqDebugChannel = getDebugChannel();
        if (!kmqDebugChannel || message.channel.id !== kmqDebugChannel.id) {
            sendErrorMessage(getMessageContext(message), { title: "Error", description: "You are not allowed to reload in this channel" });
            logger.warn(`${getDebugLogHeader(message)} | Attempted to reload in non-debug channel`);
            return;
        }

        logger.info("Reloading KMQ commands");
        try {
            await registerCommands(false);
            logger.info("Reload KMQ commands complete");
            sendInfoMessage(getMessageContext(message), { title: "Reload Complete", description: "All changes should now be applied" });
        } catch (e) {
            logger.error(`Error reloading KMQ commands: err = ${e}`);
            sendErrorMessage(getMessageContext(message), { title: "Error Reloading", description: `Uh oh.\n${e}` });
        }
    }
}
