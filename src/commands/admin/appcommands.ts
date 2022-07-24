import { BOOKMARK_COMMAND_NAME, PROFILE_COMMAND_NAME } from "../../constants";
import { IPCLogger } from "../../logger";
import { sendErrorMessage, sendInfoMessage } from "../../helpers/discord_utils";
import CommandPrechecks from "../../command_prechecks";
import EnvType from "../../enums/env_type";
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
        maxArgCount: 2,
        arguments: [
            {
                name: "action",
                type: "enum" as const,
                enums: Object.values(AppCommandsAction),
            },
            {
                name: "command",
                type: "string" as const,
            },
        ],
    };

    preRunChecks = [{ checkFn: CommandPrechecks.debugChannelPrecheck }];

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
        const appCommandType = parsedMessage.components[0] as AppCommandsAction;
        const isSingleCommand = parsedMessage.components.length === 2;
        if (
            isSingleCommand &&
            !State.client.commands[parsedMessage.components[1]]
        ) {
            sendErrorMessage(MessageContext.fromMessage(message), {
                title: "Invalid Command Name",
            });
            return;
        }

        const commandsReloaded = [];
        if (appCommandType === AppCommandsAction.RELOAD) {
            const commandsToModify = isSingleCommand
                ? [State.client.commands[parsedMessage.components[1]]]
                : Object.values(State.client.commands);

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

                for (const command of commandsToModify) {
                    if (command.slashCommands) {
                        const commands = command.slashCommands();
                        for (const cmd of commands) {
                            logger.info(`Creating global command: ${cmd.name}`);
                            try {
                                // eslint-disable-next-line no-await-in-loop
                                await State.client.createCommand(cmd);
                                commandsReloaded.push(cmd.name);
                            } catch (e) {
                                logger.error(
                                    `Failed to create guild command: ${
                                        cmd.name
                                    }. err = ${JSON.stringify(e)}`
                                );
                                continue;
                            }
                        }
                    }
                }
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

                for (const command of commandsToModify) {
                    if (command.slashCommands) {
                        const commands = command.slashCommands();
                        for (const cmd of commands) {
                            logger.info(`Creating guild command: ${cmd.name}`);
                            try {
                                // eslint-disable-next-line no-await-in-loop
                                await debugServer.createCommand(cmd);
                                commandsReloaded.push(cmd.name);
                            } catch (e) {
                                logger.error(
                                    `Failed to create guild command: ${
                                        cmd.name
                                    }. err = ${JSON.stringify(e)}`
                                );
                                continue;
                            }
                        }
                    }
                }
            }

            sendInfoMessage(MessageContext.fromMessage(message), {
                title: "Application Commands Reloaded",
                description: commandsReloaded.join(", "),
            });
        } else {
            const commandsToModify = isSingleCommand
                ? [parsedMessage.components[1]]
                : Object.keys(State.client.commands);

            const commands = (await State.client.getCommands()).filter((x) =>
                commandsToModify.includes(x.name)
            );

            await Promise.allSettled(
                commands.map(async (command) => {
                    logger.info(
                        `Deleting global application command: ${command.name} -- ${command.id}`
                    );
                    await State.client.deleteCommand(command.id);
                    commandsReloaded.push(command.name);
                })
            );

            const debugServer = State.client.guilds.get(
                process.env.DEBUG_SERVER_ID
            );

            if (!debugServer) return;
            const guildCommands = (
                await State.client.getGuildCommands(debugServer.id)
            ).filter((x) => commandsToModify.includes(x.name));

            await Promise.allSettled(
                guildCommands.map(async (command) => {
                    logger.info(
                        `Deleting guild application command: ${command.name} -- ${command.id}`
                    );

                    await State.client.deleteGuildCommand(
                        debugServer.id,
                        command.id
                    );
                    commandsReloaded.push(command.name);
                })
            );

            sendInfoMessage(MessageContext.fromMessage(message), {
                title: "Commands Deleted",
                description: commandsReloaded.join(", "),
            });
        }
    };
}
