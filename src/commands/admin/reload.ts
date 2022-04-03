import { execSync } from "child_process";

import CommandPrechecks from "../../command_prechecks";
import { sendErrorMessage, sendInfoMessage } from "../../helpers/discord_utils";
import { state } from "../../kmq_worker";
import { IPCLogger } from "../../logger";
import MessageContext from "../../structures/message_context";
import BaseCommand, { CommandArgs } from "../interfaces/base_command";

const logger = new IPCLogger("reload");

export enum ReloadType {
    CLUSTER = "cluster",
    ALL = "all",
}

export default class ReloadCommand implements BaseCommand {
    preRunChecks = [{ checkFn: CommandPrechecks.debugChannelPrecheck }];

    validations = {
        arguments: [
            {
                enums: Object.values(ReloadType),
                name: "reloadType",
                type: "enum" as const,
            },
        ],
        maxArgCount: 1,
        minArgCount: 1,
    };

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
        try {
            execSync("npx tsc");
        } catch (e) {
            logger.error("Error transpiling KMQ commands");
            sendErrorMessage(MessageContext.fromMessage(message), {
                description: `Uh oh.\n${e}`,
                title: "Error Reloading",
            });
            return;
        }

        const reloadType = parsedMessage.components[0] as ReloadType;
        if (reloadType === ReloadType.ALL) {
            state.ipc.allClustersCommand("reload_commands");
            sendInfoMessage(MessageContext.fromMessage(message), {
                description: "See logs for completion status",
                title: "Reloading All Clusters",
            });
            return;
        }

        ReloadCommand.reloadCommands();
        sendInfoMessage(MessageContext.fromMessage(message), {
            description: "All changes should now be applied",
            title: "Cluster Reload Complete",
        });
    };

    static reloadCommands(): void {
        logger.info("Reloading all commands");
        state.client.reloadCommands();
    }
}
