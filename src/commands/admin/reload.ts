import * as cp from "child_process";
import { IPCLogger } from "../../logger";
import { sendErrorMessage, sendInfoMessage } from "../../helpers/discord_utils";
import CommandPrechecks from "../../command_prechecks";
import MessageContext from "../../structures/message_context";
import State from "../../state";
import util from "util";
import type BaseCommand from "../interfaces/base_command";
import type CommandArgs from "../../interfaces/command_args";

const exec = util.promisify(cp.exec);

const logger = new IPCLogger("reload");

enum ReloadType {
    CLUSTER = "cluster",
    ALL = "all",
}

export default class ReloadCommand implements BaseCommand {
    preRunChecks = [{ checkFn: CommandPrechecks.userAdminPrecheck }];

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

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
        try {
            await exec("npx tsc");
        } catch (e) {
            logger.error("Error transpiling KMQ commands");
            await sendErrorMessage(MessageContext.fromMessage(message), {
                title: "Error Reloading",
                description: `Uh oh.\n${e}`,
            });
            return;
        }

        const reloadType = parsedMessage.components[0] as ReloadType;
        if (reloadType === ReloadType.ALL) {
            await State.ipc.allClustersCommand("reload_commands");
            await sendInfoMessage(MessageContext.fromMessage(message), {
                title: "Reloading All Clusters",
                description: "See logs for completion status",
            });
            return;
        }

        await ReloadCommand.reloadCommands();
        await sendInfoMessage(MessageContext.fromMessage(message), {
            title: "Cluster Reload Complete",
            description: "All changes should now be applied",
        });
    };

    static async reloadCommands(): Promise<void> {
        logger.info("Reloading all commands");
        await State.client.reloadCommands();
    }
}
