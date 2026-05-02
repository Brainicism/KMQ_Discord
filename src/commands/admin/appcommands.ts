import CommandPrechecks from "../../command_prechecks";
import AppCommandsAction from "../../enums/app_command_action";
import EnvType from "../../enums/env_type";
import { sendInfoMessage } from "../../helpers/discord_utils";
import type CommandArgs from "../../interfaces/command_args";
import { IPCLogger } from "../../logger";
import State from "../../state";
import MessageContext from "../../structures/message_context";
import type BaseCommand from "../interfaces/base_command";

const logger = new IPCLogger("app_commands");

export default class AppCommandsCommand implements BaseCommand {
    validations = {
        minArgCount: 1,
        maxArgCount: 2,
        arguments: [
            {
                name: "action",
                type: "enum" as const,
                enums: Object.values(AppCommandsAction),
            },
        ],
    };

    preRunChecks = [{ checkFn: CommandPrechecks.userAdminPrecheck }];

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
        const isProd = process.env.NODE_ENV === EnvType.PROD;

        const commandModificationScope = isProd ? "global" : "guild";

        const appCommandType = parsedMessage.components[0] as AppCommandsAction;
        if (appCommandType === AppCommandsAction.RELOAD) {
            logger.info(
                `Creating ${commandModificationScope} application commands...`,
            );

            await State.ipc.allClustersCommand(
                `reload_app_commands|${message.guildID}`,
                true,
            );
        } else {
            logger.info(
                `Deleting ${commandModificationScope} application commands`,
            );

            await State.ipc.allClustersCommand(
                `delete_app_commands|${message.guildID}`,
                true,
            );
        }

        await sendInfoMessage(MessageContext.fromMessage(message), {
            title: "Commands Updated",
        });
    };
}
