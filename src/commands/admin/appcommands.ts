/* eslint-disable no-await-in-loop */
import { BOOKMARK_COMMAND_NAME, PROFILE_COMMAND_NAME } from "../../constants";
import { IPCLogger } from "../../logger";
import { sendErrorMessage, sendInfoMessage } from "../../helpers/discord_utils";
import CommandPrechecks from "../../command_prechecks";
import EnvType from "../../enums/env_type";
import Eris from "eris";
import LocaleType from "../../enums/locale_type";
import LocalizationManager from "../../helpers/localization_manager";
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

        const isProd = process.env.NODE_ENV === EnvType.PROD;
        const debugServer = State.client.guilds.get(
            process.env.DEBUG_SERVER_ID
        );

        if (!isProd && !debugServer) return;

        const commandModificationScope = isProd ? "global" : "guild";

        const commandsModifiedSuccess = [];
        const commandsModifiedFailed = [];
        if (appCommandType === AppCommandsAction.RELOAD) {
            const commandsToModify = isSingleCommand
                ? Object.entries({
                      [parsedMessage.components[1]]:
                          State.client.commands[parsedMessage.components[1]],
                  })
                : Object.entries(State.client.commands);

            const createApplicationCommandFunc: (
                command: Eris.ApplicationCommandStructure
            ) => Promise<Eris.ApplicationCommand> = isProd
                ? State.client.createCommand
                : debugServer.createCommand.bind(debugServer);

            logger.info(
                `Creating ${commandModificationScope} application commands...`
            );

            const commandStructures: Array<Eris.ApplicationCommandStructure> =
                isSingleCommand
                    ? []
                    : [
                          {
                              name: BOOKMARK_COMMAND_NAME,
                              type: Eris.Constants.ApplicationCommandTypes
                                  .MESSAGE,
                          },
                          {
                              name: PROFILE_COMMAND_NAME,
                              type: Eris.Constants.ApplicationCommandTypes
                                  .MESSAGE,
                          },
                          {
                              name: PROFILE_COMMAND_NAME,
                              type: Eris.Constants.ApplicationCommandTypes.USER,
                          },
                      ];

            for (const commandObj of commandsToModify) {
                const commandName = commandObj[0];
                const command = commandObj[1];
                if (command.slashCommands) {
                    const commands =
                        command.slashCommands() as Array<Eris.ChatInputApplicationCommandStructure>;

                    for (const cmd of commands) {
                        cmd.name =
                            cmd.name ??
                            LocalizationManager.translate(
                                LocaleType.EN,
                                `command.${commandName}.help.name`
                            );

                        cmd.name_localizations = cmd.name_localizations ?? {
                            [LocaleType.KO]: LocalizationManager.translate(
                                LocaleType.KO,
                                `command.${commandName}.help.name`
                            ),
                        };
                        if (
                            cmd.type ===
                            Eris.Constants.ApplicationCommandTypes.CHAT_INPUT
                        ) {
                            cmd.description =
                                cmd.description ??
                                LocalizationManager.translate(
                                    LocaleType.EN,
                                    `command.${commandName}.help.description`
                                );

                            cmd.description_localizations =
                                cmd.description_localizations ?? {
                                    [LocaleType.KO]:
                                        LocalizationManager.translate(
                                            LocaleType.KO,
                                            `command.${commandName}.help.description`
                                        ),
                                };
                        }

                        commandStructures.push(cmd);
                    }
                }
            }

            for (const commandStructure of commandStructures) {
                logger.info(
                    `Creating ${commandModificationScope} command: ${commandStructure.name}`
                );
                try {
                    await createApplicationCommandFunc(commandStructure);
                    commandsModifiedSuccess.push(commandStructure.name);
                } catch (e) {
                    commandsModifiedFailed.push(commandStructure.name);
                    logger.error(
                        `(Potentially) Failed to create ${commandModificationScope} command: ${
                            commandStructure.name
                        }. err = ${JSON.stringify(e)}`
                    );
                    continue;
                }
            }

            sendInfoMessage(MessageContext.fromMessage(message), {
                title: "Application Commands Reloaded",
                description: `**Successfully loaded**: ${commandsModifiedSuccess.join(
                    ", "
                )}\n**(Potentially) Failed to load**: ${commandsModifiedFailed.join(
                    ", "
                )}`,
            });
        } else {
            let commands = isProd
                ? await State.client.getCommands()
                : await State.client.getGuildCommands(debugServer.id);

            if (isSingleCommand) {
                commands = commands.filter(
                    (x) => x.name === parsedMessage.components[1]
                );
            }

            for (const command of commands) {
                logger.info(
                    `Deleting ${commandModificationScope} application command: ${command.name} -- ${command.id}`
                );

                try {
                    if (isProd) {
                        State.client.getCommands();
                        await State.client.deleteCommand(command.id);
                    } else {
                        await State.client.deleteGuildCommand(
                            debugServer.id,
                            command.id
                        );
                    }

                    commandsModifiedSuccess.push(command.name);
                } catch (e) {
                    logger.error(
                        `(Potentially) Failed to delete ${commandModificationScope} command: ${
                            command.name
                        }. err = ${JSON.stringify(e)}`
                    );
                    commandsModifiedFailed.push(command.name);
                    continue;
                }
            }

            sendInfoMessage(MessageContext.fromMessage(message), {
                title: "Commands Deleted",
                description: `**Successfully deleted**: ${commandsModifiedSuccess.join(
                    ", "
                )}\n**(Potentially) Failed to delete**: ${commandsModifiedFailed.join(
                    ", "
                )}`,
            });
        }
    };
}
