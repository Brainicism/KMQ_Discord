const logger = require("../logger")("validate")
const getDebugContext = require("../helpers/utils").getDebugContext;
module.exports = (message, parsedMessage, validations, botPrefix) => {
    if (!validations) return true;
    let args = parsedMessage.components;
    if (args.length > validations.maxArgCount || args.length < validations.minArgCount) {
        validationWarning(message, `Incorrect number of arguments. See \`${botPrefix}help ${parsedMessage.action}\` for usage`, args);
        return false;
    }
    for (let i = 0; i < args.length; i++) {
        let validation = validations.arguments[i];
        let arg = args[i];
        //check arg type
        switch (validation.type) {
            case "number":
                if (isNaN(arg)) {
                    validationWarning(message, `Expected numeric value for \`${validation.name}\``, arg)
                    return false;
                }
                //parse as integer for now, might cause problems later?
                arg = parseInt(arg);
                if (validation.minValue && arg < validation.minValue) {
                    validationWarning(message, `Expected value greater than \`${validation.minValue}\` for \`${validation.name}\``, arg)
                    return false;
                }
                if (validation.maxValue && arg > validation.maxValue) {
                    validationWarning(message, `Expected value less than or equal to \`${validation.maxValue}\` for \`${validation.name}\``, arg)
                    return false;
                }
                break;
            case "boolean":
                arg = arg.toLowerCase();
                if (!(arg == "false" || arg == "true")) {
                    validationWarning(message, `Expected true/false value for \`${validation.name}\``, arg)

                    return false;
                }
                break;
            case "enum":
                let enums = validation.enums;
                arg = arg.toLowerCase();
                if (!enums.includes(arg)) {
                    validationWarning(message, `Expected one of the following valid \`${validation.name}\` values: (${arrayToString(enums)})`, arg)
                    return false;
                }
                break;
            case "char":
                if (arg.length !== 1) {
                    validationWarning(message, `Expected a character for \`${validation.name}\``, arg)
                    return false;
                }
                break;
            default:
                logger.error(`Undefined argument type. ${validation}`)
        }
    }
    return true;
}

const validationWarning = (message, warning, arg) => {
    message.channel.send(warning);
    logger.warn(`${getDebugContext(message)} | ${warning}. val = ${arg}`);
}

const arrayToString = (elements) => {
    elements = elements.map(element => `\`${element}\``);
    if (elements.length == 1) return elements[0]
    let lastElement = elements.splice(-1);
    return `${elements.join(", ")} and ${lastElement}`
}
