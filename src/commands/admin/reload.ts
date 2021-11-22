import { execSync } from "child_process";
import { IPCLogger } from "../../logger";
import BaseCommand, { CommandArgs } from "../interfaces/base_command";
import { sendErrorMessage, sendInfoMessage } from "../../helpers/discord_utils";
import MessageContext from "../../structures/message_context";
import { state } from "../../kmq_worker";
import CommandPrechecks from "../../command_prechecks";

const logger = new IPCLogger("reload");

export enum ReloadType {
    CLUSTER = "cluster",
    ALL = "all",
}

export default class ReloadCommand implements BaseCommand {
    preRunChecks = [{ checkFn: CommandPrechecks.debugChannelPrecheck }];

    validations = {
        minArgCount: 1,
        maxArgCount: 1,
        arguments: [
            {
                name: "reloadType",
                type: "enum" as const,
                enums: Object.values(ReloadType),
            },
        ],
    };

    call = async ({ message, parsedMessage }: CommandArgs) => {
        try {
            execSync("npx tsc");
        } catch (e) {
            logger.error("Error transpiling KMQ commands");
            sendErrorMessage(MessageContext.fromMessage(message), { title: "Error Reloading", description: `Uh oh.\n${e}` });
            return;
        }

        const reloadType = parsedMessage.components[0] as ReloadType;
        if (reloadType === ReloadType.ALL) {
            state.ipc.allClustersCommand("reload_commands");
            sendInfoMessage(MessageContext.fromMessage(message), { title: "Reloading All Clusters", description: "See logs for completion status" });
            return;
        }

        ReloadCommand.reloadCommands();
        sendInfoMessage(MessageContext.fromMessage(message), { title: "Cluster Reload Complete", description: "All changes should now be applied" });
    };

    static reloadCommands() {
        logger.info("Reloading all commands");
        state.client.reloadCommands();
    }
}
