import Eris, { EmbedOptions } from "eris";
import BaseCommand, { CommandArgs, Help } from "../interfaces/base_command";
import {
    sendErrorMessage,
    getDebugLogHeader,
    sendPaginationedEmbed,
    sendInfoMessage,
} from "../../helpers/discord_utils";
import { IPCLogger } from "../../logger";
import { chunkArray } from "../../helpers/utils";
import { GuildTextableMessage } from "../../types";
import { KmqImages } from "../../constants";
import MessageContext from "../../structures/message_context";
import KmqClient from "../../kmq_client";
import { state } from "../../kmq_worker";

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
                title: state.localizer.translate(
                    message.guildID,
                    "command.help.title",
                    {
                        kmq: "K-pop Music Quiz",
                    }
                ),
                description: state.localizer.translate(
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

        embedTitle = `\`${helpManual.usage
            .replace(placeholder, process.env.BOT_PREFIX)
            .split("")
            .reverse()
            .join("")}\``;
        embedDesc = helpManual.description;
        embedActionRowComponents = helpManual.actionRowComponents;
        if (helpManual.examples.length > 0) {
            embedDesc += `\n\n**${state.localizer.translate(
                message.guildID,
                "command.help.examples"
            )}**\n`;
        }

        embedFields = helpManual.examples.map((example) => ({
            name: example.example
                .replace(placeholder, process.env.BOT_PREFIX)
                .split("")
                .reverse()
                .join(""),
            value: example.explanation,
        }));

        if (commandFilesWithAliases[action].aliases) {
            embedFooter = {
                text: `${state.localizer.translate(
                    message.guildID,
                    "misc.inGame.aliases"
                )}: ${commandFilesWithAliases[action].aliases
                    .join(", ")
                    .split("")
                    .reverse()
                    .join("")}`,
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
                play: `\`${process.env.BOT_PREFIX}play\``,
                options: `\`${process.env.BOT_PREFIX}options\``,
                help: `${process.env.BOT_PREFIX}help`,
                command: state.localizer.translate(
                    message.guildID,
                    "command.help.command"
                ),
            }
        );

        embedFields = commandsWithHelp.map((command) => {
            const helpManual = command.help(message.guildID);
            return {
                name: helpManual.name.split("").reverse().join(""),
                value: `${helpManual.description}\n${state.localizer.translate(
                    message.guildID,
                    "misc.usage"
                )}: \`${helpManual.usage
                    .replace(placeholder, process.env.BOT_PREFIX)
                    .split("")
                    .reverse()
                    .join("")}\``,
            };
        });

        embedActionRowComponents = [
            {
                style: 5,
                url: "https://discord.gg/RCuzwYV",
                type: 2,
                label: state.localizer.translate(
                    message.guildID,
                    "misc.interaction.officialKmqServer"
                ),
            },
            {
                style: 5,
                url: "https://brainicism.github.io/KMQ_Discord/GAMEPLAY",
                type: 2,
                label: state.localizer.translate(
                    message.guildID,
                    "misc.interaction.howToPlay"
                ),
            },
            {
                style: 5,
                url: "https://brainicism.github.io/KMQ_Discord/FAQ",
                type: 2,
                label: state.localizer.translate(
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
    help = (guildID: string): Help => ({
        name: "help",
        description: state.localizer.translate(
            guildID,
            "command.help.help.description"
        ),
        usage: `,help [${state.localizer.translate(
            guildID,
            "command.help.command"
        )}]`,
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
        priority: 1000,
    });

    call = async ({ parsedMessage, message }: CommandArgs): Promise<void> => {
        await helpMessage(message, parsedMessage.argument);
        logger.info(
            `${getDebugLogHeader(message)} | Help documentation retrieved.`
        );
    };
}
