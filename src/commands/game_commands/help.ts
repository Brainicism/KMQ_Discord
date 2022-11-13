import { IPCLogger } from "../../logger";
import { KmqImages, MAX_AUTOCOMPLETE_FIELDS } from "../../constants";
import { chunkArray } from "../../helpers/utils";
import {
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
import LocalizationManager from "../../helpers/localization_manager";
import MessageContext from "../../structures/message_context";
import State from "../../state";
import type { EmbedOptions } from "eris";
import type { GuildTextableMessage } from "../../types";
import type BaseCommand from "../interfaces/base_command";
import type CommandArgs from "../../interfaces/command_args";
import type HelpDocumentation from "../../interfaces/help";

const logger = new IPCLogger("help");
const placeholder = /,/g;
const FIELDS_PER_EMBED = 6;
const excludedCommands = ["premium"];

export default class HelpCommand implements BaseCommand {
    help = (guildID: string): HelpDocumentation => ({
        name: "help",
        description: LocalizationManager.localizer.translate(
            guildID,
            "command.help.help.description"
        ),
        usage: `,help [${LocalizationManager.localizer.translate(
            guildID,
            "command.help.command"
        )}]`,
        examples: [
            {
                example: "`,help`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.help.help.example.allCommands"
                ),
            },
            {
                example: "`,help cutoff`",
                explanation: LocalizationManager.localizer.translate(
                    guildID,
                    "command.help.help.example.sampleCommand"
                ),
            },
        ],
        priority: 1000,
    });

    slashCommands = (): Array<Eris.ChatInputApplicationCommandStructure> => [
        {
            name: "help",
            description: LocalizationManager.localizer.translate(
                LocaleType.EN,
                "command.help.help.description"
            ),
            type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
            options: [
                {
                    name: "action",
                    description: LocalizationManager.localizer.translate(
                        LocaleType.EN,
                        "command.help.interaction.action"
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
        action: string
    ): Promise<void> {
        let embedTitle = "";
        let embedDesc = "";
        let embedFields = [];
        let embedActionRowComponents: Eris.ActionRowComponents[] = null;
        const commandFiles = State.client.commands;
        for (const command of excludedCommands) {
            delete commandFiles[command];
        }

        const messageContext = new MessageContext(
            messageOrInteraction.channel.id,
            new KmqMember(messageOrInteraction.member.id),
            messageOrInteraction.guildID
        );

        const commandFilesWithAliases: { [commandName: string]: BaseCommand } =
            {};

        Object.assign(commandFilesWithAliases, commandFiles);
        const commandNamesWithAliases = Object.keys(commandFiles).filter(
            (commandName) => commandFiles[commandName].aliases
        );

        for (const commandName of commandNamesWithAliases) {
            const { aliases } = commandFiles[commandName];
            for (const alias of aliases) {
                commandFilesWithAliases[alias] = commandFiles[commandName];
            }
        }

        let embedFooter = null;
        if (action) {
            const commandNamesWithHelp = Object.keys(
                commandFilesWithAliases
            ).filter(
                (commandName) => commandFilesWithAliases[commandName].help
            );

            logger.info(
                `${getDebugLogHeader(
                    messageContext
                )} | Getting help documentation for: ${action}`
            );
            if (!commandNamesWithHelp.includes(action)) {
                logger.warn(
                    `${getDebugLogHeader(
                        messageContext
                    )} | Missing documentation: ${action}`
                );

                await sendErrorMessage(
                    messageContext,
                    {
                        title: LocalizationManager.localizer.translate(
                            messageContext.guildID,
                            "command.help.title",
                            {
                                kmq: "K-pop Music Quiz",
                            }
                        ),
                        description: LocalizationManager.localizer.translate(
                            messageContext.guildID,
                            "command.help.failure.noDocs",
                            { action }
                        ),
                    },
                    messageOrInteraction instanceof Eris.CommandInteraction
                        ? messageOrInteraction
                        : null
                );
                return;
            }

            const helpManual = commandFilesWithAliases[action].help(
                messageContext.guildID
            );

            embedTitle = `\`${helpManual.usage.replace(
                placeholder,
                process.env.BOT_PREFIX
            )}\``;
            embedDesc = helpManual.description;
            embedActionRowComponents = helpManual.actionRowComponents;
            if (helpManual.examples.length > 0) {
                embedDesc += `\n\n**${LocalizationManager.localizer.translate(
                    messageContext.guildID,
                    "command.help.examples"
                )}**\n`;
            }

            embedFields = helpManual.examples.map((example) => ({
                name: example.example.replace(
                    placeholder,
                    process.env.BOT_PREFIX
                ),
                value: example.explanation,
            }));

            if (commandFilesWithAliases[action].aliases) {
                embedFooter = {
                    text: `${LocalizationManager.localizer.translate(
                        messageContext.guildID,
                        "misc.inGame.aliases"
                    )}: ${commandFilesWithAliases[action].aliases.join(", ")}`,
                };
            }
        } else {
            logger.info(
                `${getDebugLogHeader(
                    messageContext
                )} | Getting full help documentation`
            );
            const commandsWithHelp = Object.values(commandFiles).filter(
                (command) => command.help
            );

            commandsWithHelp.sort(
                (x, y) => y.help(null).priority - x.help(null).priority
            );

            embedTitle = LocalizationManager.localizer.translate(
                messageContext.guildID,
                "command.help.title",
                {
                    kmq: "K-pop Music Quiz",
                }
            );

            embedDesc = LocalizationManager.localizer.translate(
                messageContext.guildID,
                "command.help.description",
                {
                    play: `\`${process.env.BOT_PREFIX}play\``,
                    options: `\`${process.env.BOT_PREFIX}options\``,
                    help: `${process.env.BOT_PREFIX}help`,
                    command: LocalizationManager.localizer.translate(
                        messageContext.guildID,
                        "command.help.command"
                    ),
                }
            );

            embedFields = commandsWithHelp.map((command) => {
                const helpManual = command.help(messageContext.guildID);
                return {
                    name: helpManual.name,
                    value: `${
                        helpManual.description
                    }\n${LocalizationManager.localizer.translate(
                        messageContext.guildID,
                        "misc.usage"
                    )}: \`${helpManual.usage.replace(
                        placeholder,
                        process.env.BOT_PREFIX
                    )}\``,
                };
            });

            embedActionRowComponents = [
                {
                    style: 5,
                    url: "https://discord.gg/RCuzwYV",
                    type: 2,
                    label: LocalizationManager.localizer.translate(
                        messageContext.guildID,
                        "misc.interaction.officialKmqServer"
                    ),
                },
                {
                    style: 5,
                    url: "https://brainicism.github.io/KMQ_Discord/GAMEPLAY",
                    type: 2,
                    label: LocalizationManager.localizer.translate(
                        messageContext.guildID,
                        "misc.interaction.howToPlay"
                    ),
                },
                {
                    style: 5,
                    url: "https://brainicism.github.io/KMQ_Discord/FAQ",
                    type: 2,
                    label: LocalizationManager.localizer.translate(
                        messageContext.guildID,
                        "misc.interaction.faq"
                    ),
                },
            ];
        }

        if (embedFields.length > 0) {
            const embedFieldSubsets = chunkArray(embedFields, FIELDS_PER_EMBED);
            const embeds: Array<EmbedOptions> = embedFieldSubsets.map(
                (embedFieldsSubset) => ({
                    title: embedTitle,
                    description: embedDesc,
                    fields: embedFieldsSubset,
                    footer: embedFooter,
                    thumbnail: {
                        url: KmqImages.READING_BOOK,
                    },
                })
            );

            await sendPaginationedEmbed(
                messageOrInteraction,
                embeds,
                embedActionRowComponents
                    ? [{ type: 1, components: embedActionRowComponents }]
                    : undefined
            );
        } else {
            await sendInfoMessage(
                messageContext,
                {
                    title: embedTitle,
                    description: embedDesc,
                    footerText: embedFooter ? embedFooter.text : null,
                    thumbnailUrl: KmqImages.READING_BOOK,
                    components: embedActionRowComponents
                        ? [{ type: 1, components: embedActionRowComponents }]
                        : undefined,
                },
                false,
                null,
                [],
                messageOrInteraction instanceof Eris.CommandInteraction
                    ? messageOrInteraction
                    : null
            );
        }
    }

    call = async ({ parsedMessage, message }: CommandArgs): Promise<void> => {
        await HelpCommand.helpMessage(message, parsedMessage.argument);
        logger.info(
            `${getDebugLogHeader(message)} | Help documentation retrieved.`
        );
    };

    /**
     * @param interaction - The interaction
     */
    async processChatInputInteraction(
        interaction: Eris.CommandInteraction
    ): Promise<void> {
        const { interactionOptions } = getInteractionValue(interaction);

        await HelpCommand.helpMessage(
            interaction,
            interactionOptions["action"]
        );
    }

    /**
     * Handles showing suggested command names
     * @param interaction - The interaction with intermediate typing state
     */
    static async processAutocompleteInteraction(
        interaction: Eris.AutocompleteInteraction
    ): Promise<void> {
        const interactionData = getInteractionValue(interaction);
        const focusedKey = interactionData.focusedKey;
        const focusedVal = interactionData.interactionOptions[focusedKey];
        const lowercaseUserInput = focusedVal.toLowerCase();
        const commands = Object.values(State.client.commands)
            .filter((x) => x.help)
            .map((x) => x.help(interaction.guildID))
            .filter((x) => !excludedCommands.includes(x.name))
            .sort((a, b) => b.priority - a.priority);

        if (!lowercaseUserInput) {
            await tryAutocompleteInteractionAcknowledge(
                interaction,
                commands
                    .map((x) => ({ name: x.name, value: x.name }))
                    .slice(0, MAX_AUTOCOMPLETE_FIELDS)
            );
        } else {
            await tryAutocompleteInteractionAcknowledge(
                interaction,
                commands
                    .filter((x) => x.name.startsWith(lowercaseUserInput))
                    .map((x) => ({ name: x.name, value: x.name }))
                    .slice(0, MAX_AUTOCOMPLETE_FIELDS)
            );
        }
    }
}
