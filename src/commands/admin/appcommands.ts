import Eris from "eris";
import CommandPrechecks from "../../command_prechecks";
import { BOOKMARK_COMMAND_NAME, PROFILE_COMMAND_NAME } from "../../events/client/interactionCreate";
import { sendInfoMessage } from "../../helpers/discord_utils";
import { state } from "../../kmq";
import { IPCLogger } from "../../logger";
import MessageContext from "../../structures/message_context";
import { EnvType } from "../../types";
import BaseCommand, { CommandArgs } from "../interfaces/base_command";

const logger = new IPCLogger("app_commands");

export enum AppCommandsAction {
    RELOAD = "reload",
    DELETE = "delete",
}

export default class AppCommandsCommand implements BaseCommand {
    validations = {
        minArgCount: 1,
        maxArgCount: 1,
        arguments: [
            {
                name: "action",
                type: "enum" as const,
                enums: Object.values(AppCommandsAction),
            },
        ],
    };

    preRunChecks = [{ checkFn: CommandPrechecks.debugChannelPrecheck }];

    call = async ({ message, parsedMessage }: CommandArgs) => {
        const artistType = parsedMessage.components[0] as AppCommandsAction;
        if (artistType === AppCommandsAction.RELOAD) {
            if (process.env.NODE_ENV === EnvType.PROD) {
                logger.info("Creating global application commands...");
                await state.client.createCommand({
                    name: BOOKMARK_COMMAND_NAME,
                    type: Eris.Constants.ApplicationCommandTypes.MESSAGE,
                });

                await state.client.createCommand({
                    name: PROFILE_COMMAND_NAME,
                    type: Eris.Constants.ApplicationCommandTypes.USER,
                });
            } else if (process.env.NODE_ENV === EnvType.DEV) {
                logger.info("Creating guild application commands...");
                const debugServer = state.client.guilds.get(process.env.DEBUG_SERVER_ID);
                if (!debugServer) return;
                await debugServer.createCommand({
                    name: BOOKMARK_COMMAND_NAME,
                    type: Eris.Constants.ApplicationCommandTypes.MESSAGE,
                });

                await debugServer.createCommand({
                    name: PROFILE_COMMAND_NAME,
                    type: Eris.Constants.ApplicationCommandTypes.USER,
                });
            }

            sendInfoMessage(MessageContext.fromMessage(message), {
                title: "Application Commands Reloaded",
                description: "Both guild and global commands reloaded.",
            });
        } else {
            const commands = await state.client.getCommands();
            for (const command of commands) {
                logger.info(`Deleting global application command: ${command.id} `);
                await state.client.deleteCommand(command.id);
            }

            const debugServer = state.client.guilds.get(process.env.DEBUG_SERVER_ID);
            if (!debugServer) return;
            const guildCommands = await state.client.getGuildCommands(debugServer.id);
            for (const command of guildCommands) {
                logger.info(`Deleting guild application command: ${command.id}`);
                await state.client.deleteGuildCommand(debugServer.id, command.id);
            }

            sendInfoMessage(MessageContext.fromMessage(message), {
                title: "Commands Deleted",
                description: "Both guild and global commands deleted.",
            });
        }
    };
}
