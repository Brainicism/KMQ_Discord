import { BOOKMARK_COMMAND_NAME, PROFILE_COMMAND_NAME } from "../../constants";
import { IPCLogger } from "../../logger";
import { delay } from "../../helpers/utils";
import { sendInfoMessage } from "../../helpers/discord_utils";
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

                for (const command of Object.values(State.client.commands)) {
                    if (command.slashCommands) {
                        const commands = command.slashCommands();
                        for (const cmd of commands) {
                            logger.info(`Creating global command: ${cmd.name}`);
                            try {
                                // eslint-disable-next-line no-await-in-loop
                                await State.client.createCommand(cmd);
                                // eslint-disable-next-line no-await-in-loop
                                await delay(1000);
                            } catch (e) {
                                logger.error(
                                    `Failed to create guild command: ${cmd.name}. err = ${e}`
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

                for (const command of Object.values(State.client.commands)) {
                    if (command.slashCommands) {
                        const commands = command.slashCommands();
                        for (const cmd of commands) {
                            if (cmd.name !== "multiguess") continue;
                            logger.info(`Creating guild command: ${cmd.name}`);
                            try {
                                // eslint-disable-next-line no-await-in-loop
                                await debugServer.createCommand(cmd);
                                // eslint-disable-next-line no-await-in-loop
                                await delay(1000);
                            } catch (e) {
                                logger.error(
                                    `Failed to create guild command: ${cmd.name}. err = ${e}`
                                );
                                continue;
                            }
                        }
                    }
                }
            }

            sendInfoMessage(MessageContext.fromMessage(message), {
                title: "Application Commands Reloaded",
                description: "Yay.",
            });
        } else {
            const commands = await State.client.getCommands();

            await Promise.allSettled(
                commands.map(async (command) => {
                    logger.info(
                        `Deleting global application command: ${command.name} -- ${command.id}`
                    );
                    await State.client.deleteCommand(command.id);
                })
            );

            const debugServer = State.client.guilds.get(
                process.env.DEBUG_SERVER_ID
            );

            if (!debugServer) return;
            const guildCommands = await State.client.getGuildCommands(
                debugServer.id
            );

            await Promise.allSettled(
                guildCommands.map(async (command) => {
                    logger.info(
                        `Deleting guild application command: ${command.id}`
                    );

                    await State.client.deleteGuildCommand(
                        debugServer.id,
                        command.id
                    );
                })
            );

            sendInfoMessage(MessageContext.fromMessage(message), {
                title: "Commands Deleted",
                description: "No!!",
            });
        }
    };
}
