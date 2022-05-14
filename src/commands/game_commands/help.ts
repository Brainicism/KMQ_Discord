import { IPCLogger } from "../../logger";
import { KmqImages } from "../../constants";
import { chunkArray } from "../../helpers/utils";
import {
    getDebugLogHeader,
    sendErrorMessage,
    sendInfoMessage,
    sendPaginationedEmbed,
} from "../../helpers/discord_utils";
import KmqClient from "../../kmq_client";
import LocalizationManager from "../../helpers/localization_manager";
import MessageContext from "../../structures/message_context";
import type { EmbedOptions } from "eris";
import type { GuildTextableMessage } from "../../types";
import type BaseCommand from "../interfaces/base_command";
import type CommandArgs from "../../interfaces/command_args";
import type Eris from "eris";
import type HelpDocumentation from "../../interfaces/help";

const logger = new IPCLogger("help");
const placeholder = /,/g;
const FIELDS_PER_EMBED = 6;
const excludedCommands = ["premium"];

const helpMessage = async (
    message: GuildTextableMessage,
    action: string
): Promise<void> => {
    let embedTitle = "";
    let embedDesc = "";
    let embedFields = [];
    let embedActionRowComponents: Eris.ActionRowComponents[] = null;
    const commandFiles = KmqClient.getCommandFiles(false);
    for (const command of excludedCommands) {
        delete commandFiles[command];
    }

    const commandFilesWithAliases: { [commandName: string]: BaseCommand } = {};
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
        ).filter((commandName) => commandFilesWithAliases[commandName].help);

        logger.info(
            `${getDebugLogHeader(
                message
            )} | Getting help documentation for: ${action}`
        );
        if (!commandNamesWithHelp.includes(action)) {
            logger.warn(
                `${getDebugLogHeader(
                    message
                )} | Missing documentation: ${action}`
            );

            await sendErrorMessage(MessageContext.fromMessage(message), {
                title: LocalizationManager.localizer.translate(
                    message.guildID,
                    "command.help.title",
                    {
                        kmq: "K-pop Music Quiz",
                    }
                ),
                description: LocalizationManager.localizer.translate(
                    message.guildID,
                    "command.help.failure.noDocs",
                    { action }
                ),
            });
            return;
        }

        const helpManual = commandFilesWithAliases[action].help(
            message.guildID
        );

        embedTitle = `\`${helpManual.usage.replace(
            placeholder,
            process.env.BOT_PREFIX
        )}\``;
        embedDesc = helpManual.description;
        embedActionRowComponents = helpManual.actionRowComponents;
        if (helpManual.examples.length > 0) {
            embedDesc += `\n\n**${LocalizationManager.localizer.translate(
                message.guildID,
                "command.help.examples"
            )}**\n`;
        }

        embedFields = helpManual.examples.map((example) => ({
            name: example.example.replace(placeholder, process.env.BOT_PREFIX),
            value: example.explanation,
        }));

        if (commandFilesWithAliases[action].aliases) {
            embedFooter = {
                text: `${LocalizationManager.localizer.translate(
                    message.guildID,
                    "misc.inGame.aliases"
                )}: ${commandFilesWithAliases[action].aliases.join(", ")}`,
            };
        }
    } else {
        logger.info(
            `${getDebugLogHeader(message)} | Getting full help documentation`
        );
        const commandsWithHelp = Object.values(commandFiles).filter(
            (command) => command.help
        );

        commandsWithHelp.sort(
            (x, y) => y.help(null).priority - x.help(null).priority
        );

        embedTitle = LocalizationManager.localizer.translate(
            message.guildID,
            "command.help.title",
            {
                kmq: "K-pop Music Quiz",
            }
        );

        embedDesc = LocalizationManager.localizer.translate(
            message.guildID,
            "command.help.description",
            {
                play: `\`${process.env.BOT_PREFIX}play\``,
                options: `\`${process.env.BOT_PREFIX}options\``,
                help: `${process.env.BOT_PREFIX}help`,
                command: LocalizationManager.localizer.translate(
                    message.guildID,
                    "command.help.command"
                ),
            }
        );

        embedFields = commandsWithHelp.map((command) => {
            const helpManual = command.help(message.guildID);
            return {
                name: helpManual.name,
                value: `${
                    helpManual.description
                }\n${LocalizationManager.localizer.translate(
                    message.guildID,
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
                    message.guildID,
                    "misc.interaction.officialKmqServer"
                ),
            },
            {
                style: 5,
                url: "https://brainicism.github.io/KMQ_Discord/GAMEPLAY",
                type: 2,
                label: LocalizationManager.localizer.translate(
                    message.guildID,
                    "misc.interaction.howToPlay"
                ),
            },
            {
                style: 5,
                url: "https://brainicism.github.io/KMQ_Discord/FAQ",
                type: 2,
                label: LocalizationManager.localizer.translate(
                    message.guildID,
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
            message,
            embeds,
            embedActionRowComponents
                ? [{ type: 1, components: embedActionRowComponents }]
                : undefined
        );
    } else {
        await sendInfoMessage(MessageContext.fromMessage(message), {
            title: embedTitle,
            description: embedDesc,
            footerText: embedFooter ? embedFooter.text : null,
            thumbnailUrl: KmqImages.READING_BOOK,
            components: embedActionRowComponents
                ? [{ type: 1, components: embedActionRowComponents }]
                : undefined,
        });
    }
};

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

    call = async ({ parsedMessage, message }: CommandArgs): Promise<void> => {
        await helpMessage(message, parsedMessage.argument);
        logger.info(
            `${getDebugLogHeader(message)} | Help documentation retrieved.`
        );
    };
}
