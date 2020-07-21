import BaseCommand, { CommandArgs } from "./base_command";
import * as Discord from "discord.js"
import * as helpMessages from "../../data/help_strings.json";
import { EMBED_INFO_COLOR, sendErrorMessage, getDebugContext, getCommandFiles, sendMessage } from "../helpers/discord_utils";
import { Embeds as EmbedsMode } from 'discord-paginationembed';
import _logger from "../logger";
import { TextChannel, RichEmbed } from "discord.js";
const logger = _logger("help");
const placeholder = /!/g;
const FIELDS_PER_EMBED = 5;
const PAGINATION_EMBED_PERMISSIONS: Discord.PermissionResolvable = ["MANAGE_MESSAGES", "EMBED_LINKS", "VIEW_CHANNEL", "SEND_MESSAGES"];

class HelpCommand implements BaseCommand {
    async call({ parsedMessage, message, botPrefix }: CommandArgs) {
        await helpMessage(message, parsedMessage.argument, botPrefix);
    }
    help =
        {
            "name": "help",
            "description": "Get help about the game's commands. Add the action as an argument to get information about specific arguments.",
            "usage": "!help [action]",
            "arguments": [
                {
                    "name": "action",
                    "description": "Any valid command for the K-pop Music Quiz bot"
                }
            ]
        }
}

export default HelpCommand;

// Usage: `!help [action]` or `!help`
const helpMessage = async (message: Discord.Message, action: string, botPrefix: string) => {
    let embedTitle = "";
    let embedDesc = "";
    let embedFields = [];
    //TODO: potentially do some caching?
    let commandFiles = await getCommandFiles();
    let commandFilesWithAliases = {};
    Object.assign(commandFilesWithAliases, commandFiles);
    let commandNamesWithAliases = Object.keys(commandFiles).filter((commandName) => commandFiles[commandName].aliases);
    for (let commandName of commandNamesWithAliases) {
        let aliases = commandFiles[commandName].aliases;
        aliases.forEach(alias => {
            commandFilesWithAliases[alias] = commandFiles[commandName];
        });
    }

    let embedFooter = null;
    if (action) {
        let commandNamesWithHelp = Object.keys(commandFilesWithAliases).filter((commandName) => commandFilesWithAliases[commandName].help);
        if (!(commandNamesWithHelp.includes(action))) {
            logger.warn(`${getDebugContext(message)} | Missing documentation: ${action}`);
            await sendErrorMessage(message,
                "K-pop Music Quiz Command Help",
                `Sorry, there is no documentation on ${action}`)
            return;
        }
        let helpManual = commandFilesWithAliases[action].help;
        embedTitle = `\`${helpManual.usage.replace(placeholder, botPrefix)}\``;
        embedDesc = helpManual.description;
        helpManual.arguments.forEach((argument) => {
            embedFields.push({
                name: argument.name,
                value: argument.description
            })
        });
        if (commandFilesWithAliases[action].aliases) {
            embedFooter = {
                text: `Aliases: ${commandFilesWithAliases[action].aliases.join(", ")}`
            }
        }

    }
    else {
        let commandNamesWithHelp = Object.keys(commandFiles).filter((commandName) => commandFiles[commandName].help);
        embedTitle = "K-pop Music Quiz Command Help";
        embedDesc = helpMessages.rules.replace(placeholder, botPrefix);
        commandNamesWithHelp.forEach((commandName) => {
            let helpManual = commandFiles[commandName].help;
            embedFields.push({
                name: helpManual.name,
                value: `${helpManual.description}\nUsage: \`${helpManual.usage.replace(placeholder, botPrefix)}\``
            })
        });

    }
    let embeds = []
    for (let i = 0; i < embedFields.length; i += FIELDS_PER_EMBED) {
        let embedFieldsSubset = embedFields.slice(i, Math.min(i + FIELDS_PER_EMBED, embedFields.length));
        embeds.push(new RichEmbed(
            {
                title: embedTitle,
                color: EMBED_INFO_COLOR,
                description: embedDesc,
                fields: embedFieldsSubset,
                footer: embedFooter
            }
        ))
    }
    let channel = message.channel as TextChannel;
    let missingPermissions = channel.permissionsFor(message.guild.me).missing(PAGINATION_EMBED_PERMISSIONS);
    if (missingPermissions.length > 0) {
        await sendMessage(message, {
            embed: {
                title: embedTitle,
                color: EMBED_INFO_COLOR,
                description: embedDesc,
                fields: embedFields,
                footer: embedFooter
            }
        })
        await sendErrorMessage(message, "Missing Permissions", `Hi! I require the following permissions [${missingPermissions.join(", ")}] in ${message.guild.name}'s #${channel.name} channel. Please double check the text channel's permissions.`)
        return;
    }

    await new EmbedsMode()
        .setArray(embeds)
        .setAuthorizedUsers([message.author.id])
        .setDisabledNavigationEmojis(["JUMP", "DELETE"])
        .setChannel(message.channel as TextChannel)
        .setPageIndicator(true)
        .build();
}
