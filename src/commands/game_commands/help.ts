import { IPCLogger } from "../../logger";
import { KmqImages, MAX_AUTOCOMPLETE_FIELDS } from "../../constants";
import { chunkArray } from "../../helpers/utils";
import {
    clickableSlashCommand,
    getDebugLogHeader,
    getInteractionValue,
    sendErrorMessage,
    sendInfoMessage,
    sendPaginationedEmbed,
    tryAutocompleteInteractionAcknowledge,
} from "../../helpers/discord_utils";
import Eris from "eris";
import KmqMember from "../../structures/kmq_member";
import LocaleType from "../../enums/locale_type";
import MessageContext from "../../structures/message_context";
import State from "../../state";
import i18n from "../../helpers/localization_manager";
import type { DefaultSlashCommand } from "../interfaces/base_command";
import type { EmbedOptions } from "eris";
import type { GuildTextableMessage } from "../../types";
import type BaseCommand from "../interfaces/base_command";
import type CommandArgs from "../../interfaces/command_args";
import type HelpDocumentation from "../../interfaces/help";

const COMMAND_NAME = "help";
const logger = new IPCLogger(COMMAND_NAME);

export default class HelpCommand implements BaseCommand {
    static FIELDS_PER_EMBED = 8;
    static excludedCommands: Array<string> = [];
    help = (guildID: string): HelpDocumentation => ({
        name: COMMAND_NAME,
        description: i18n.translate(guildID, "command.help.help.description"),
        examples: [
            {
                example: clickableSlashCommand(COMMAND_NAME),
                explanation: i18n.translate(
                    guildID,
                    "command.help.help.example.allCommands",
                ),
            },
            {
                example: `${clickableSlashCommand(COMMAND_NAME)} action:cutoff`,
                explanation: i18n.translate(
                    guildID,
                    "command.help.help.example.sampleCommand",
                ),
            },
        ],
        priority: 1000,
    });

    slashCommands = (): Array<
        DefaultSlashCommand | Eris.ChatInputApplicationCommandStructure
    > => [
        {
            type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
            options: [
                {
                    name: "action",
                    description: i18n.translate(
                        LocaleType.EN,
                        "command.help.interaction.action",
                    ),
                    description_localizations: Object.values(LocaleType)
                        .filter((x) => x !== LocaleType.EN)
                        .reduce(
                            (acc, locale) => ({
                                ...acc,
                                [locale]: i18n.translate(
                                    locale,
                                    "command.help.interaction.action",
                                ),
                            }),
                            {},
                        ),
                    type: Eris.Constants.ApplicationCommandOptionTypes.STRING,
                    required: false,
                    autocomplete: true,
                },
            ],
        },
    ];

    static async helpMessage(
        messageOrInteraction: GuildTextableMessage | Eris.CommandInteraction,
        action: string,
    ): Promise<void> {
        let embedTitle = "";
        let embedDesc = "";
        let embedFields: { name: string; value: string }[] = [];
        let embedActionRowComponents: Eris.ActionRowComponents[] | undefined =
            [];

        const commandFiles = State.client.commands;
        for (const command of HelpCommand.excludedCommands) {
            delete commandFiles[command];
        }

        const messageContext = new MessageContext(
            messageOrInteraction.channel.id,
            new KmqMember(messageOrInteraction.member!.id),
            messageOrInteraction.guildID as string,
        );

        const commandFilesWithAliases: { [commandName: string]: BaseCommand } =
            {};

        Object.assign(commandFilesWithAliases, commandFiles);

        const commandNamesWithAliases = Object.keys(commandFiles).filter(
            (commandName) => commandFiles[commandName]?.aliases,
        );

        for (const commandName of commandNamesWithAliases) {
            const commandFile = commandFiles[commandName];
            if (!commandFile) {
                logger.error(
                    `Unknown command name while accessing commandFiles: ${commandName}`,
                );
                continue;
            }

            const { aliases } = commandFile;
            for (const alias of aliases ?? []) {
                commandFilesWithAliases[alias] = commandFile;
            }
        }

        let embedFooter: { text: string } | undefined;
        if (action) {
            const commandNamesWithHelp = Object.keys(
                commandFilesWithAliases,
            ).filter(
                (commandName) => commandFilesWithAliases[commandName]?.help,
            );

            logger.info(
                `${getDebugLogHeader(
                    messageContext,
                )} | Getting help documentation for: ${action}`,
            );
            if (!commandNamesWithHelp.includes(action)) {
                logger.warn(
                    `${getDebugLogHeader(
                        messageContext,
                    )} | Missing documentation: ${action}`,
                );

                await sendErrorMessage(
                    messageContext,
                    {
                        title: i18n.translate(
                            messageContext.guildID,
                            "command.help.title",
                            {
                                kmq: "K-pop Music Quiz",
                            },
                        ),
                        description: i18n.translate(
                            messageContext.guildID,
                            "command.help.failure.noDocs",
                            { action },
                        ),
                    },
                    messageOrInteraction instanceof Eris.CommandInteraction
                        ? messageOrInteraction
                        : undefined,
                );
                return;
            }

            const helpManualFunc = commandFilesWithAliases[action]!.help;
            if (!helpManualFunc) {
                logger.error(`No help manual found for ${action}. Skipping.`);
                return;
            }

            const helpManual = helpManualFunc(messageContext.guildID);

            embedTitle = `/${helpManual.name}`;
            embedDesc = helpManual.description;
            embedActionRowComponents = helpManual.actionRowComponents;
            if (helpManual.examples.length > 0) {
                embedDesc += `\n\n**${i18n.translate(
                    messageContext.guildID,
                    "command.help.examples",
                )}**\n`;
            }

            embedFields = helpManual.examples.map((example) => ({
                name: example.example,
                value: example.explanation,
            }));

            const aliases = commandFilesWithAliases[action]!.aliases;
            if (aliases) {
                embedFooter = {
                    text: `${i18n.translate(
                        messageContext.guildID,
                        "misc.inGame.aliases",
                    )}: ${aliases.join(", ")}`,
                };
            }
        } else {
            logger.info(
                `${getDebugLogHeader(
                    messageContext,
                )} | Getting full help documentation`,
            );
            const commandsWithHelp = Object.values(commandFiles).filter(
                (command) => command.help,
            );

            commandsWithHelp.sort(
                (x, y) => y.help!("").priority - x.help!("").priority,
            );

            embedTitle = i18n.translate(
                messageContext.guildID,
                "command.help.title",
                {
                    kmq: "K-pop Music Quiz",
                },
            );

            embedDesc = i18n.translate(
                messageContext.guildID,
                "command.help.description",
                {
                    play: clickableSlashCommand("play"),
                    options: clickableSlashCommand("options"),
                    help: clickableSlashCommand(COMMAND_NAME),
                    command: i18n.translate(
                        messageContext.guildID,
                        "command.help.command",
                    ),
                },
            );

            embedFields = commandsWithHelp.map((command) => {
                const helpManual = command.help!(messageContext.guildID);
                return {
                    name: clickableSlashCommand(helpManual.name),
                    value: helpManual.description,
                };
            });

            embedActionRowComponents = [
                {
                    style: Eris.Constants.ButtonStyles.LINK,
                    url: "https://discord.gg/RCuzwYV",
                    type: Eris.Constants.ComponentTypes.BUTTON,
                    label: i18n.translate(
                        messageContext.guildID,
                        "misc.interaction.officialKmqServer",
                    ),
                },
                {
                    style: Eris.Constants.ButtonStyles.LINK,
                    url: "https://brainicism.github.io/KMQ_Discord/GAMEPLAY",
                    type: Eris.Constants.ComponentTypes.BUTTON,
                    label: i18n.translate(
                        messageContext.guildID,
                        "misc.interaction.howToPlay",
                    ),
                },
                {
                    style: Eris.Constants.ButtonStyles.LINK,
                    url: "https://brainicism.github.io/KMQ_Discord/FAQ",
                    type: Eris.Constants.ComponentTypes.BUTTON,
                    label: i18n.translate(
                        messageContext.guildID,
                        "misc.interaction.faq",
                    ),
                },
            ];
        }

        if (embedFields.length > 0) {
            const embedFieldSubsets = chunkArray(
                embedFields,
                HelpCommand.FIELDS_PER_EMBED,
            );

            const embeds: Array<EmbedOptions> = embedFieldSubsets.map(
                (embedFieldsSubset) => ({
                    title: embedTitle,
                    description: embedDesc,
                    fields: embedFieldsSubset,
                    footer: embedFooter,
                    thumbnail: {
                        url: KmqImages.READING_BOOK,
                    },
                }),
            );

            await sendPaginationedEmbed(
                messageOrInteraction,
                embeds,
                embedActionRowComponents
                    ? [{ type: 1, components: embedActionRowComponents }]
                    : undefined,
            );
        } else {
            await sendInfoMessage(
                messageContext,
                {
                    title: embedTitle,
                    description: embedDesc,
                    footerText: embedFooter ? embedFooter.text : undefined,
                    thumbnailUrl: KmqImages.READING_BOOK,
                    actionRows: embedActionRowComponents
                        ? [
                              {
                                  type: Eris.Constants.ComponentTypes
                                      .ACTION_ROW,
                                  components: embedActionRowComponents,
                              },
                          ]
                        : undefined,
                },
                false,
                undefined,
                [],
                messageOrInteraction instanceof Eris.CommandInteraction
                    ? messageOrInteraction
                    : undefined,
            );
        }
    }

    call = async ({ parsedMessage, message }: CommandArgs): Promise<void> => {
        await HelpCommand.helpMessage(message, parsedMessage.argument);
        logger.info(
            `${getDebugLogHeader(message)} | Help documentation retrieved.`,
        );
    };

    /**
     * @param interaction - The interaction
     */
    async processChatInputInteraction(
        interaction: Eris.CommandInteraction,
    ): Promise<void> {
        const { interactionOptions } = getInteractionValue(interaction);

        await HelpCommand.helpMessage(
            interaction,
            interactionOptions["action"],
        );
    }

    /**
     * Handles showing suggested command names
     * @param interaction - The interaction with intermediate typing state
     */
    static async processAutocompleteInteraction(
        interaction: Eris.AutocompleteInteraction,
    ): Promise<void> {
        const interactionData = getInteractionValue(interaction);
        const focusedKey = interactionData.focusedKey;
        if (focusedKey === null) {
            logger.error(
                "focusedKey unexpectedly null in processGroupAutocompleteInteraction",
            );

            return;
        }

        const focusedVal = interactionData.interactionOptions[focusedKey];
        const lowercaseUserInput = focusedVal.toLowerCase();
        const commands = Object.values(State.client.commands)
            .filter((x) => x.help)
            .map((x) => x.help!(interaction.guildID as string))
            .filter((x) => !HelpCommand.excludedCommands.includes(x.name))
            .sort((a, b) => b.priority - a.priority);

        if (!lowercaseUserInput) {
            await tryAutocompleteInteractionAcknowledge(
                interaction,
                commands
                    .map((x) => ({ name: x.name, value: x.name }))
                    .slice(0, MAX_AUTOCOMPLETE_FIELDS),
            );
        } else {
            await tryAutocompleteInteractionAcknowledge(
                interaction,
                commands
                    .filter((x) => x.name.startsWith(lowercaseUserInput))
                    .map((x) => ({ name: x.name, value: x.name }))
                    .slice(0, MAX_AUTOCOMPLETE_FIELDS),
            );
        }
    }
}
