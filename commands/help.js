const helpMessages = require('../data/help_strings.json');
const config = require("../config.json");
const botPrefix = config.prefix;
const placeholder = "!";

module.exports = {
    call: ({ client, parsedMessage, message }) => {
        help(message, parsedMessage.argument);
    }
}

// Usage: `!help [action]` or `!help`
const help = (message, action) => {
    let embedTitle = "";
    let embedDesc = "";
    let embedFields = [];
    if (action) {
        let helpActionList = helpMessages.actions.map(a => a.name);
        if (!helpActionList.includes(action)) {
            message.channel.send("Sorry, there is no documentation on " + action);
            return;
        }

        let detailedAction = helpMessages.actions.find(a => a.name === action)
        embedTitle = `\`${detailedAction.usage.replace(placeholder, botPrefix)}\``;
        embedDesc = detailedAction.description;
        detailedAction.arguments.forEach((argument) => {
            embedFields.push({
                name: argument.name,
                value: argument.description
            })
        });
    }
    else {
        embedTitle = "KMQ Command Help"
        embedDesc = helpMessages.rules
        helpMessages.actions.forEach((action) => {
            embedFields.push({
                name: action.name,
                value: action.description + "\n Usage: " + action.usage
            })
        });
    }

    message.channel.send({
        embed: {
            title: embedTitle,
            description: embedDesc,
            fields: embedFields
        }
    })
}
