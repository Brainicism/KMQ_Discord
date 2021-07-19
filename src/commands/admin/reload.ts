import { execSync } from "child_process";
import { IPCLogger } from "../../logger";
import { registerCommands } from "../../helpers/management_utils";
import BaseCommand, { CommandArgs } from "../interfaces/base_command";
import { getDebugChannel, getDebugLogHeader, sendErrorMessage, sendInfoMessage } from "../../helpers/discord_utils";
import MessageContext from "../../structures/message_context";

const logger = new IPCLogger("reload");

export default class EvalCommand implements BaseCommand {
    call = async ({ message }: CommandArgs) => {
        const kmqDebugChannel = getDebugChannel();
        if (!kmqDebugChannel || message.channel.id !== kmqDebugChannel.id) {
            sendErrorMessage(MessageContext.fromMessage(message), { title: "Error", description: "You are not allowed to reload in this channel" });
            logger.warn(`${getDebugLogHeader(message)} | Attempted to reload in non-debug channel`);
            return;
        }

        logger.info("Reloading KMQ commands");
        try {
            execSync("npx tsc");
            await registerCommands(false);
            logger.info("Reload KMQ commands complete");
            sendInfoMessage(MessageContext.fromMessage(message), { title: "Reload Complete", description: "All changes should now be applied" });
        } catch (e) {
            logger.error(`Error reloading KMQ commands: err = ${e}`);
            sendErrorMessage(MessageContext.fromMessage(message), { title: "Error Reloading", description: `Uh oh.\n${e}` });
        }
    };
}
