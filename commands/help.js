const helpMessages = require('../data/help_strings.json');
const config = require("../config.json");
const placeholder = "!";

module.exports = {
    call: ({ parsedMessage, message, botPrefix }) => {
        help(message, parsedMessage.argument, botPrefix);
    }
}

// Usage: `!help [action]` or `!help`
const help = (message, action, botPrefix) => {
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
        embedTitle = "K-pop Music Quiz Command Help";
        embedDesc = helpMessages.rules.replace(placeholder, botPrefix);
        helpMessages.actions.forEach((action) => {
            embedFields.push({
                name: action.name,
                value: `${action.description}\nUsage: \`${action.usage.replace(placeholder, botPrefix)}\``
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
