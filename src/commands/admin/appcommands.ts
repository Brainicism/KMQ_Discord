import { BOOKMARK_COMMAND_NAME, PROFILE_COMMAND_NAME } from "../../constants";
import { EnvType } from "../../enums/env_type";
import { IPCLogger } from "../../logger";
import { sendInfoMessage } from "../../helpers/discord_utils";
import CommandPrechecks from "../../command_prechecks";
import Eris from "eris";
import MessageContext from "../../structures/message_context";
import State from "../../state";
import type BaseCommand from "../interfaces/base_command";
import type CommandArgs from "../../interfaces/command_args";

const logger = new IPCLogger("app_commands");

enum AppCommandsAction {
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

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
        const artistType = parsedMessage.components[0] as AppCommandsAction;
        if (artistType === AppCommandsAction.RELOAD) {
            if (process.env.NODE_ENV === EnvType.PROD) {
                logger.info("Creating global application commands...");
                await State.client.createCommand({
                    name: BOOKMARK_COMMAND_NAME,
                    type: Eris.Constants.ApplicationCommandTypes.MESSAGE,
                });

                await State.client.createCommand({
                    name: PROFILE_COMMAND_NAME,
                    type: Eris.Constants.ApplicationCommandTypes.MESSAGE,
                });

                await State.client.createCommand({
                    name: PROFILE_COMMAND_NAME,
                    type: Eris.Constants.ApplicationCommandTypes.USER,
                });
            } else if (process.env.NODE_ENV === EnvType.DEV) {
                logger.info("Creating guild application commands...");
                const debugServer = State.client.guilds.get(
                    process.env.DEBUG_SERVER_ID
                );

                if (!debugServer) return;
                await debugServer.createCommand({
                    name: BOOKMARK_COMMAND_NAME,
                    type: Eris.Constants.ApplicationCommandTypes.MESSAGE,
                });

                await debugServer.createCommand({
                    name: PROFILE_COMMAND_NAME,
                    type: Eris.Constants.ApplicationCommandTypes.MESSAGE,
                });

                await debugServer.createCommand({
                    name: PROFILE_COMMAND_NAME,
                    type: Eris.Constants.ApplicationCommandTypes.USER,
                });
            }

            sendInfoMessage(MessageContext.fromMessage(message), {
                title: "Application Commands Reloaded",
                description: "Yay.",
            });
        } else {
            const commands = await State.client.getCommands();
            for (const command of commands) {
                logger.info(
                    `Deleting global application command: ${command.id}`
                );
                await State.client.deleteCommand(command.id);
            }

            const debugServer = State.client.guilds.get(
                process.env.DEBUG_SERVER_ID
            );

            if (!debugServer) return;
            const guildCommands = await State.client.getGuildCommands(
                debugServer.id
            );

            for (const command of guildCommands) {
                logger.info(
                    `Deleting guild application command: ${command.id}`
                );

                await State.client.deleteGuildCommand(
                    debugServer.id,
                    command.id
                );
            }

            sendInfoMessage(MessageContext.fromMessage(message), {
                title: "Commands Deleted",
                description: "No!!",
            });
        }
    };
}
