/* eslint-disable no-await-in-loop */
import { BOOKMARK_COMMAND_NAME, PROFILE_COMMAND_NAME } from "../../constants";
import { IPCLogger } from "../../logger";
import { sendErrorMessage, sendInfoMessage } from "../../helpers/discord_utils";
import CommandPrechecks from "../../command_prechecks";
import EnvType from "../../enums/env_type";
import Eris from "eris";
import LocaleType from "../../enums/locale_type";
import MessageContext from "../../structures/message_context";
import State from "../../state";
import i18n from "../../helpers/localization_manager";
import type BaseCommand from "../interfaces/base_command";
import type CommandArgs from "../../interfaces/command_args";

const logger = new IPCLogger("app_commands");

const MAX_DESCRIPTION_LENGTH = 100;

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
            process.env.DEBUG_SERVER_ID as string
        );

        if (!isProd && !debugServer) return;

        const commandModificationScope = isProd ? "global" : "guild";

        let commandStructures: Eris.ApplicationCommandStructure[] = [];

        if (appCommandType === AppCommandsAction.RELOAD) {
            logger.info(
                `Creating ${commandModificationScope} application commands...`
            );

            commandStructures = isSingleCommand
                ? []
                : [
                      {
                          name: BOOKMARK_COMMAND_NAME,
                          type: Eris.Constants.ApplicationCommandTypes.MESSAGE,
                      },
                      {
                          name: PROFILE_COMMAND_NAME,
                          type: Eris.Constants.ApplicationCommandTypes.MESSAGE,
                      },
                      {
                          name: PROFILE_COMMAND_NAME,
                          type: Eris.Constants.ApplicationCommandTypes.USER,
                      },
                  ];

            for (const commandObj of Object.entries(State.client.commands)) {
                const commandName = commandObj[0];
                const command = commandObj[1];
                if (command.slashCommands) {
                    const commands =
                        command.slashCommands() as Array<Eris.ChatInputApplicationCommandStructure>;

                    for (const cmd of commands) {
                        if (!cmd.name) {
                            if (
                                !i18n.hasKey(`command.${commandName}.help.name`)
                            ) {
                                throw new Error(
                                    `Missing slash command name: command.${commandName}.help.name`
                                );
                            }

                            cmd.name = i18n.translate(
                                LocaleType.EN,
                                `command.${commandName}.help.name`
                            );
                        }

                        cmd.nameLocalizations = cmd.nameLocalizations ?? {
                            [LocaleType.KO]: i18n.translate(
                                LocaleType.KO,
                                `command.${commandName}.help.name`
                            ),
                        };
                        if (
                            cmd.type ===
                            Eris.Constants.ApplicationCommandTypes.CHAT_INPUT
                        ) {
                            if (!cmd.description) {
                                let translationKey = `command.${commandName}.help.interaction.description`;
                                const fallbackTranslationKey = `command.${commandName}.help.description`;
                                if (!i18n.hasKey(translationKey)) {
                                    if (!i18n.hasKey(fallbackTranslationKey)) {
                                        throw new Error(
                                            `Missing slash command description: ${translationKey} or ${fallbackTranslationKey}`
                                        );
                                    }

                                    translationKey = fallbackTranslationKey;
                                }

                                cmd.description = i18n.translate(
                                    LocaleType.EN,
                                    translationKey
                                );

                                cmd.descriptionLocalizations = {
                                    [LocaleType.KO]: i18n.translate(
                                        LocaleType.KO,
                                        translationKey
                                    ),
                                };
                            }
                        }

                        type CommandStructure =
                            Eris.ChatInputApplicationCommandStructure & {
                                [key: string]:
                                    | string
                                    | Array<string>
                                    | { [key: string]: string | Array<string> };
                            };

                        const verifyDescriptionLengths = (
                            cmdObj: CommandStructure
                        ): void => {
                            const checkDescriptionLength = (
                                description: string
                            ): void => {
                                if (
                                    description.length > MAX_DESCRIPTION_LENGTH
                                ) {
                                    throw new Error(
                                        `Slash command description too long: ${description}`
                                    );
                                }
                            };

                            const checkDescriptionLocalizationsLength = (
                                descriptionLocalizations: Array<string>
                            ): void => {
                                for (const locale in descriptionLocalizations) {
                                    if (
                                        descriptionLocalizations[locale]
                                            .length > MAX_DESCRIPTION_LENGTH
                                    ) {
                                        throw new Error(
                                            `Slash command descriptionLocalization for ${locale} too long: ${descriptionLocalizations[locale]}`
                                        );
                                    }
                                }
                            };

                            for (const key in cmdObj) {
                                if (Object.hasOwn(cmdObj, key)) {
                                    const val:
                                        | string
                                        | Array<string>
                                        | {
                                              [key: string]:
                                                  | string
                                                  | Array<string>;
                                          } = cmdObj[key];

                                    if (key === "description") {
                                        const description = val as string;
                                        checkDescriptionLength(description);
                                    } else if (
                                        key === "descriptionLocalizations"
                                    ) {
                                        const descriptionLocalizations =
                                            val as Array<string>;

                                        checkDescriptionLocalizationsLength(
                                            descriptionLocalizations
                                        );
                                    } else if (key === "options") {
                                        const options = val as {
                                            [key: string]:
                                                | string
                                                | Array<string>;
                                        };

                                        for (const nestedKey in options) {
                                            if (
                                                Object.hasOwn(
                                                    options,
                                                    nestedKey
                                                )
                                            ) {
                                                const nestedVal =
                                                    options[nestedKey];

                                                if (
                                                    nestedKey === "description"
                                                ) {
                                                    const description =
                                                        nestedVal as string;

                                                    checkDescriptionLength(
                                                        description
                                                    );
                                                } else if (
                                                    nestedKey ===
                                                    "descriptionLocalizations"
                                                ) {
                                                    const descriptionLocalizations =
                                                        nestedVal as Array<string>;

                                                    checkDescriptionLocalizationsLength(
                                                        descriptionLocalizations
                                                    );
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        };

                        verifyDescriptionLengths(cmd as CommandStructure);
                        commandStructures.push(cmd);
                    }
                }
            }
        } else {
            logger.info(
                `Deleting ${commandModificationScope} application commands`
            );

            commandStructures = [];
        }

        if (isProd) {
            await State.client.bulkEditCommands(commandStructures);
        } else {
            if (debugServer) {
                await State.client.bulkEditGuildCommands(
                    debugServer.id,
                    commandStructures
                );
            } else {
                logger.error("Debug server unexpectedly unavailable");
            }
        }

        await sendInfoMessage(MessageContext.fromMessage(message), {
            title: "Commands Updated",
        });
    };
}
