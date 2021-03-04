import path from "path";
import BaseCommand, { CommandArgs } from "../base_command";
import {
    EMBED_INFO_COLOR, sendErrorMessage, getDebugLogHeader, sendPaginationedEmbed, sendEmbed, getMessageContext,
} from "../../helpers/discord_utils";
import _logger from "../../logger";
import { chunkArray, parseJsonFile } from "../../helpers/utils";
import { getCommandFiles } from "../../helpers/management_utils";
import { GuildTextableMessage } from "../../types";

const logger = _logger("help");
export const placeholder = /!/g;
const FIELDS_PER_EMBED = 6;
const helpMessages = parseJsonFile(path.resolve(__dirname, "../../../data/help_strings.json"));

// Usage: `!help [action]` or `!help`
const helpMessage = async (message: GuildTextableMessage, action: string) => {
    let embedTitle = "";
    let embedDesc = "";
    let embedFields = [];

    const commandFiles = await getCommandFiles(false);

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
            await sendErrorMessage(getMessageContext(message), {
                title: "K-pop Music Quiz Command Help",
                description: `Sorry, there is no documentation on ${action}`,
            });
            return;
        }
        const helpManual = commandFilesWithAliases[action].help;
        embedTitle = `\`${helpManual.usage.replace(placeholder, process.env.BOT_PREFIX)}\``;
        embedDesc = helpManual.description;
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
        embedDesc = helpMessages.rules.replace(placeholder, process.env.BOT_PREFIX);
        embedFields = commandsWithHelp.map((command) => {
            const helpManual = command.help;
            return {
                name: helpManual.name,
                value: `${helpManual.description}\nUsage: \`${helpManual.usage.replace(placeholder, process.env.BOT_PREFIX)}\``,
            };
        });
    }

    if (embedFields.length > 0) {
        const embedFieldSubsets = chunkArray(embedFields, FIELDS_PER_EMBED);
        const embeds = embedFieldSubsets.map((embedFieldsSubset) => ({
            title: embedTitle,
            color: EMBED_INFO_COLOR,
            description: embedDesc,
            fields: embedFieldsSubset,
            footer: embedFooter,
        }));

        await sendPaginationedEmbed(message, embeds);
    } else {
        await sendEmbed(message.channel, {
            title: embedTitle,
            color: EMBED_INFO_COLOR,
            description: embedDesc,
            footer: embedFooter,
        });
    }
};

export default class HelpCommand implements BaseCommand {
    help = {
        name: "help",
        description: "Get help about the game's commands. Add a command to get information about the specific command.",
        usage: "!help [command]",
        examples: [
            {
                example: "`!help`",
                explanation: "Shows all available commands and a short description",
            },
            {
                example: "`!help cutoff`",
                explanation: "Shows a detailed description for the cutoff command",
            },
        ],
        priority: 1000,
    };

    async call({ parsedMessage, message }: CommandArgs) {
        await helpMessage(message, parsedMessage.argument);
    }
}
