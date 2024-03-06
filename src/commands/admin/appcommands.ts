/* eslint-disable no-await-in-loop */
import { IPCLogger } from "../../logger";
import { sendInfoMessage } from "../../helpers/discord_utils";
import AppCommandsAction from "../../enums/app_command_action";
import CommandPrechecks from "../../command_prechecks";
import EnvType from "../../enums/env_type";
import MessageContext from "../../structures/message_context";
import State from "../../state";
import type BaseCommand from "../interfaces/base_command";
import type CommandArgs from "../../interfaces/command_args";

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

    preRunChecks = [{ checkFn: CommandPrechecks.debugChannelPrecheck }];

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
        const isProd = process.env.NODE_ENV === EnvType.PROD;
        const debugServer = State.client.guilds.get(
            process.env.DEBUG_SERVER_ID as string,
        );

        const commandModificationScope = isProd ? "global" : "guild";

        if (!isProd && !debugServer) return;
        const appCommandType = parsedMessage.components[0] as AppCommandsAction;
        if (appCommandType === AppCommandsAction.RELOAD) {
            logger.info(
                `Creating ${commandModificationScope} application commands...`,
            );
            await State.ipc.allClustersCommand("reload_app_commands", true);
        } else {
            logger.info(
                `Deleting ${commandModificationScope} application commands`,
            );
            await State.ipc.allClustersCommand("delete_app_commands", true);
        }

        await sendInfoMessage(MessageContext.fromMessage(message), {
            title: "Commands Updated",
        });
    };
}
