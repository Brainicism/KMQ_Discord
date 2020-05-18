const helpMessages = require('../../data/help_strings.json');
const logger = require("../logger")("help");
const { EMBED_INFO_COLOR, sendErrorMessage, getDebugContext, getCommandFiles } = require("../helpers/utils");
const placeholder = "!";
function call ({ parsedMessage, message, botPrefix }) {
    helpMessage(message, parsedMessage.argument, botPrefix);
}
const help =
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


export {
    call,
    help
}

// Usage: `!help [action]` or `!help`
const helpMessage = async (message, action, botPrefix) => {
    let embedTitle = "";
    let embedDesc = "";
    let embedFields = [];
    //TODO: potentially do some caching?
    let commandFiles = await getCommandFiles();
    let commandNamesWithAliases = Object.keys(commandFiles).filter((commandName) => commandFiles[commandName].aliases);
    for (let commandName of commandNamesWithAliases) {
        let aliases = commandFiles[commandName].aliases;
        aliases.forEach(alias => {
            commandFiles[alias] = commandFiles[commandName];
        });
    }

    let commandNamesWithHelp = Object.keys(commandFiles).filter((commandName) => commandFiles[commandName].help);
    let embedFooter = null;
    if (action) {
        if (!(commandNamesWithHelp.includes(action))) {
            logger.warn(`${getDebugContext(message)} | Missing documentation: ${action}`);
            sendErrorMessage(message,
                "K-pop Music Quiz Command Help",
                `Sorry, there is no documentation on ${action}`)
            return;
        }
        let helpManual = commandFiles[action].help;
        embedTitle = `\`${helpManual.usage.replace(placeholder, botPrefix)}\``;
        embedDesc = helpManual.description;
        helpManual.arguments.forEach((argument) => {
            embedFields.push({
                name: argument.name,
                value: argument.description
            })
        });
        if (commandFiles[action].aliases) {
            embedFooter = {
                text: `Aliases: ${commandFiles[action].aliases.join(", ")}`
            }
        }

    }
    else {
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

    message.channel.send({
        embed: {
            title: embedTitle,
            color: EMBED_INFO_COLOR,
            description: embedDesc,
            fields: embedFields,
            footer: embedFooter
        }
    })
}
