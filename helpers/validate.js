module.exports = (message, parsedMessage, validations) => {
    if (!validations) return true;
    let args = parsedMessage.components;
    if (args.length > validations.maxArgCount || args.length < validations.minArgCount) {
        message.channel.send(`Incorrect number of arguments. See \`!help ${parsedMessage.action}\` for usage.`);
        return false;
    }
    for (let i = 0; i < args.length; i++) {
        let validation = validations.arguments[i];
        let arg = args[i];
        //check arg type
        switch (validation.type) {
            case "number":
                if (isNaN(arg)) {
                    message.channel.send(`Expected numeric value for \`${validation.name}\`.`)
                    return false;
                }
                //parse as integer for now, might cause problems later?
                arg = parseInt(arg);
                if (validation.minValue && arg < validation.minValue) {
                    message.channel.send(`Expected value greater than \`${validation.minValue}\` for \`${validation.name}\`.`)
                    return false;
                }
                if (validation.maxValue && arg > validation.maxValue) {
                    message.channel.send(`Expected value less than or equal to \`${validation.maxValue}\` for \`${validation.name}\`.`)
                    return false;
                }
                break;
            case "boolean":
                arg = arg.toLowerCase();
                if (!(arg == "false" || arg == "true")) {
                    message.channel.send(`Expected true/false value for \`${validation.name}\`.`)
                    return false
                }
                break;
            case "enum":
                let enums = validation.enums;
                arg = arg.toLowerCase();
                if (!enums.includes(arg)) {
                    message.channel.send(`Expected \`${JSON.stringify(enums)}\` for \`${validation.name}\`.`)
                    return false;
                }
                break;
            default:
                console.err("Undefined argument type.")
        }
    }
    return true;
}