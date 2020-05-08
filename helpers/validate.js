const logger = require("../logger")("validate")
module.exports = (message, parsedMessage, validations, botPrefix) => {
    if (!validations) return true;
    let args = parsedMessage.components;
    if (args.length > validations.maxArgCount || args.length < validations.minArgCount) {
        message.channel.send(`Incorrect number of arguments. See \`${botPrefix}help ${parsedMessage.action}\` for usage.`);
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
                    return false;
                }
                break;
            case "enum":
                let enums = validation.enums;
                arg = arg.toLowerCase();
                if (!enums.includes(arg)) {
                    message.channel.send(`Expected one of the following valid \`${validation.name}\` values: (${arrayToString(enums)}).`)
                    return false;
                }
                break;
            case "char":
                if (arg.length !== 1) {
                    message.channel.send(`Expected a character for \`${validation.name}\`.`)
                    return false;
                }
                break;
            default:
                logger.error(`Undefined argument type. ${validation}`)
        }
    }
    return true;
}

const arrayToString = (elements) => {
    elements = elements.map(element => `\`${element}\``);
    if (elements.length == 1) return elements[0]
    let lastElement = elements.splice(-1);
    return `${elements.join(", ")} and ${lastElement}`
}
