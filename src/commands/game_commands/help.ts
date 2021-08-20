import Eris, { EmbedOptions } from "eris";
import BaseCommand, { CommandArgs } from "../interfaces/base_command";
import {
    sendErrorMessage, getDebugLogHeader, sendPaginationedEmbed, sendInfoMessage,
} from "../../helpers/discord_utils";
import { IPCLogger } from "../../logger";
import { chunkArray } from "../../helpers/utils";
import { GuildTextableMessage } from "../../types";
import { KmqImages } from "../../constants";
import MessageContext from "../../structures/message_context";
import { state } from "../../kmq";

const logger = new IPCLogger("help");
export const placeholder = /,/g;
const FIELDS_PER_EMBED = 6;

const helpMessage = async (message: GuildTextableMessage, action: string) => {
    let embedTitle = "";
    let embedDesc = "";
    let embedFields = [];
    let embedActionRowComponents: Eris.ActionRowComponents[] = null;
    const commandFiles = state.client.getCommandFiles(false);

    const commandFilesWithAliases: { [commandName: string]: BaseCommand } = {};
    Object.assign(commandFilesWithAliases, commandFiles);
    const commandNamesWithAliases = Object.keys(commandFiles).filter((commandName) => commandFiles[commandName].aliases);
    for (const commandName of commandNamesWithAliases) {
        const { aliases } = commandFiles[commandName];
        for (const alias of aliases) {
            commandFilesWithAliases[alias] = commandFiles[commandName];
        }
    }

    let embedFooter = null;
    if (action) {
        const commandNamesWithHelp = Object.keys(commandFilesWithAliases).filter((commandName) => commandFilesWithAliases[commandName].help);
        logger.info(`${getDebugLogHeader(message)} | Getting help documentation for: ${action}`);
        if (!(commandNamesWithHelp.includes(action))) {
            logger.warn(`${getDebugLogHeader(message)} | Missing documentation: ${action}`);
            await sendErrorMessage(MessageContext.fromMessage(message), {
                title: "K-pop Music Quiz Command Help",
                description: `Sorry, there is no documentation on ${action}`,
            });
            return;
        }

        const helpManual = commandFilesWithAliases[action].help;
        embedTitle = `\`${helpManual.usage.replace(placeholder, process.env.BOT_PREFIX)}\``;
        embedDesc = helpManual.description;
        embedActionRowComponents = helpManual.actionRowComponents;
        if (helpManual.examples.length > 0) {
            embedDesc += "\n\n**Examples**\n";
        }

        embedFields = helpManual.examples.map((example) => ({
            name: example.example.replace(placeholder, process.env.BOT_PREFIX),
            value: example.explanation,
        }));

        if (commandFilesWithAliases[action].aliases) {
            embedFooter = {
                text: `Aliases: ${commandFilesWithAliases[action].aliases.join(", ")}`,
            };
        }
    } else {
        logger.info(`${getDebugLogHeader(message)} | Getting full help documentation`);
        const commandsWithHelp = Object.values(commandFiles).filter((command) => command.help);
        commandsWithHelp.sort((x, y) => y.help.priority - x.help.priority);
        embedTitle = "K-pop Music Quiz Command Help";
        embedDesc = `Type \`${process.env.BOT_PREFIX}play\` in chat and the bot will play a random kpop song in VC. The goal of this game is to be the first person to guess the song name in chat.
See your current game options with \`${process.env.BOT_PREFIX}options\`. Use \`${process.env.BOT_PREFIX}help [command]\` to get more details about a command.`;

        embedFields = commandsWithHelp.map((command) => {
            const helpManual = command.help;
            return {
                name: helpManual.name,
                value: `${helpManual.description}\nUsage: \`${helpManual.usage.replace(placeholder, process.env.BOT_PREFIX)}\``,
            };
        });

        embedActionRowComponents = [
            { style: 5, url: "https://discord.gg/RCuzwYV", type: 2, label: "Official KMQ Server" },
            { style: 5, url: "https://brainicism.github.io/KMQ_Discord/GAMEPLAY", type: 2, label: "How To Play" },
            { style: 5, url: "https://brainicism.github.io/KMQ_Discord/FAQ", type: 2, label: "Frequently Asked Questions" },
        ];
    }

    if (embedFields.length > 0) {
        const embedFieldSubsets = chunkArray(embedFields, FIELDS_PER_EMBED);
        const embeds: Array<EmbedOptions> = embedFieldSubsets.map((embedFieldsSubset) => ({
            title: embedTitle,
            description: embedDesc,
            fields: embedFieldsSubset,
            footer: embedFooter,
            thumbnail: {
                url: KmqImages.READING_BOOK,
            },
        }));

        await sendPaginationedEmbed(message, embeds, embedActionRowComponents ? [{ type: 1, components: embedActionRowComponents }] : undefined);
    } else {
        await sendInfoMessage(MessageContext.fromMessage(message), {
            title: embedTitle,
            description: embedDesc,
            footerText: embedFooter ? embedFooter.text : null,
            thumbnailUrl: KmqImages.READING_BOOK,
            components: embedActionRowComponents ? [{ type: 1, components: embedActionRowComponents }] : undefined,
        });
    }
};

export default class HelpCommand implements BaseCommand {
    help = {
        name: "help",
        description: "Get help about the game's commands. Add a command to get information about the specific command.",
        usage: ",help [command]",
        examples: [
            {
                example: "`,help`",
                explanation: "Shows all available commands and a short description",
            },
            {
                example: "`,help cutoff`",
                explanation: "Shows a detailed description for the cutoff command",
            },
        ],
        priority: 1000,
    };

    call = async ({ parsedMessage, message }: CommandArgs) => {
        await helpMessage(message, parsedMessage.argument);
    };
}
