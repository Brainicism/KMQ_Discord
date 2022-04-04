import Eris, { EmbedOptions } from "eris";

import { KmqImages } from "../../constants";
import {
    getDebugLogHeader,
    sendErrorMessage,
    sendInfoMessage,
    sendPaginationedEmbed,
} from "../../helpers/discord_utils";
import { chunkArray } from "../../helpers/utils";
import KmqClient from "../../kmq_client";
import { state } from "../../kmq_worker";
import { IPCLogger } from "../../logger";
import MessageContext from "../../structures/message_context";
import { GuildTextableMessage } from "../../types";
import BaseCommand, { CommandArgs, Help } from "../interfaces/base_command";

const logger = new IPCLogger("help");
export const placeholder = /,/g;
const FIELDS_PER_EMBED = 6;

const helpMessage = async (
    message: GuildTextableMessage,
    action: string
): Promise<void> => {
    let embedTitle = "";
    let embedDesc = "";
    let embedFields = [];
    let embedActionRowComponents: Eris.ActionRowComponents[] = null;
    const commandFiles = KmqClient.getCommandFiles(false);

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
                description: state.localizer.translate(
                    message.guildID,
                    "command.help.failure.noDocs",
                    { action }
                ),
                title: state.localizer.translate(
                    message.guildID,
                    "command.help.title",
                    {
                        kmq: "K-pop Music Quiz",
                    }
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
            embedDesc += `\n\n**${state.localizer.translate(
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
                text: `${state.localizer.translate(
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

        embedTitle = state.localizer.translate(
            message.guildID,
            "command.help.title",
            {
                kmq: "K-pop Music Quiz",
            }
        );

        embedDesc = state.localizer.translate(
            message.guildID,
            "command.help.description",
            {
                command: state.localizer.translate(
                    message.guildID,
                    "command.help.command"
                ),
                help: `${process.env.BOT_PREFIX}help`,
                options: `\`${process.env.BOT_PREFIX}options\``,
                play: `\`${process.env.BOT_PREFIX}play\``,
            }
        );

        embedFields = commandsWithHelp.map((command) => {
            const helpManual = command.help(message.guildID);
            return {
                name: helpManual.name,
                value: `${helpManual.description}\n${state.localizer.translate(
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
                label: state.localizer.translate(
                    message.guildID,
                    "misc.interaction.officialKmqServer"
                ),
                style: 5,
                type: 2,
                url: "https://discord.gg/RCuzwYV",
            },
            {
                label: state.localizer.translate(
                    message.guildID,
                    "misc.interaction.howToPlay"
                ),
                style: 5,
                type: 2,
                url: "https://brainicism.github.io/KMQ_Discord/GAMEPLAY",
            },
            {
                label: state.localizer.translate(
                    message.guildID,
                    "misc.interaction.faq"
                ),
                style: 5,
                type: 2,
                url: "https://brainicism.github.io/KMQ_Discord/FAQ",
            },
        ];
    }

    if (embedFields.length > 0) {
        const embedFieldSubsets = chunkArray(embedFields, FIELDS_PER_EMBED);
        const embeds: Array<EmbedOptions> = embedFieldSubsets.map(
            (embedFieldsSubset) => ({
                description: embedDesc,
                fields: embedFieldsSubset,
                footer: embedFooter,
                thumbnail: {
                    url: KmqImages.READING_BOOK,
                },
                title: embedTitle,
            })
        );

        await sendPaginationedEmbed(
            message,
            embeds,
            embedActionRowComponents
                ? [{ components: embedActionRowComponents, type: 1 }]
                : undefined
        );
    } else {
        await sendInfoMessage(MessageContext.fromMessage(message), {
            components: embedActionRowComponents
                ? [{ components: embedActionRowComponents, type: 1 }]
                : undefined,
            description: embedDesc,
            footerText: embedFooter ? embedFooter.text : null,
            thumbnailUrl: KmqImages.READING_BOOK,
            title: embedTitle,
        });
    }
};

export default class HelpCommand implements BaseCommand {
    help = (guildID: string): Help => ({
        description: state.localizer.translate(
            guildID,
            "command.help.help.description"
        ),
        examples: [
            {
                example: "`,help`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.help.help.example.allCommands"
                ),
            },
            {
                example: "`,help cutoff`",
                explanation: state.localizer.translate(
                    guildID,
                    "command.help.help.example.sampleCommand"
                ),
            },
        ],
        name: "help",
        priority: 1000,
        usage: `,help [${state.localizer.translate(
            guildID,
            "command.help.command"
        )}]`,
    });

    call = async ({ parsedMessage, message }: CommandArgs): Promise<void> => {
        await helpMessage(message, parsedMessage.argument);
        logger.info(
            `${getDebugLogHeader(message)} | Help documentation retrieved.`
        );
    };
}
