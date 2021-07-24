import { execSync } from "child_process";
import { IPCLogger } from "../../logger";
import { reloadCommands } from "../../helpers/management_utils";
import BaseCommand, { CommandArgs } from "../interfaces/base_command";
import { getDebugChannel, getDebugLogHeader, sendErrorMessage, sendInfoMessage } from "../../helpers/discord_utils";
import MessageContext from "../../structures/message_context";
import { state } from "../../kmq";

const logger = new IPCLogger("reload");

export enum ReloadType {
    CLUSTER = "cluster",
    ALL = "all",
}
export default class ReloadCommand implements BaseCommand {
    validations = {
        minArgCount: 1,
        maxArgCount: 1,
        arguments: [
            {
                name: "seekType",
                type: "enum" as const,
                enums: Object.values(ReloadType),
            },
        ],
    };

    call = async ({ message, parsedMessage }: CommandArgs) => {
        const kmqDebugChannel = getDebugChannel();
        if (!kmqDebugChannel || message.channel.id !== kmqDebugChannel.id) {
            sendErrorMessage(MessageContext.fromMessage(message), { title: "Error", description: "You are not allowed to reload in this channel" });
            logger.warn(`${getDebugLogHeader(message)} | Attempted to reload in non-debug channel`);
            return;
        }
        try {
            execSync("npx tsc");
        } catch (e) {
            logger.error("Error transpiling KMQ commands");
            sendErrorMessage(MessageContext.fromMessage(message), { title: "Error Reloading", description: `Uh oh.\n${e}` });
            return;
        }

        const reloadType = parsedMessage.components[0] as ReloadType;
        if (reloadType === ReloadType.ALL) {
            state.ipc.broadcast("reload_commands");
            sendInfoMessage(MessageContext.fromMessage(message), { title: "Reloading all clusters", description: "See logs for completion status" });
            return;
        }

        reloadCommands();
        sendInfoMessage(MessageContext.fromMessage(message), { title: "Cluster Reload Complete", description: "All changes should now be applied" });
    };
}
