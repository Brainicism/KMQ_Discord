const logger = require("../logger")("validate")
const getDebugContext = require("./utils").getDebugContext;
const { sendErrorMessage } = require("./utils");

export default (message, parsedMessage, validations, botPrefix) => {
    if (!validations) return true;
    let args = parsedMessage.components;
    if (args.length > validations.maxArgCount || args.length < validations.minArgCount) {
        sendValidationErrorMessage(message,
            `Incorrect number of arguments. See \`${botPrefix}help ${parsedMessage.action}\` for usage.`,
            args);
        return false;
    }
    for (let i = 0; i < args.length; i++) {
        let validation = validations.arguments[i];
        let arg = args[i];
        //check arg type
        switch (validation.type) {
            case "number":
                if (isNaN(arg)) {
                    sendValidationErrorMessage(message,
                        `Expected numeric value for \`${validation.name}\`.`,
                        arg);
                    return false;
                }
                //parse as integer for now, might cause problems later?
                arg = parseInt(arg);
                if (validation.minValue && arg < validation.minValue) {
                    sendValidationErrorMessage(message,
                        `Expected value greater than \`${validation.minValue}\` for \`${validation.name}\`.`,
                        arg);
                    return false;
                }
                if (validation.maxValue && arg > validation.maxValue) {
                    sendValidationErrorMessage(message,
                        `Expected value less than or equal to \`${validation.maxValue}\` for \`${validation.name}\`.`,
                        arg);
                    return false;
                }
                break;
            case "boolean":
                arg = arg.toLowerCase();
                if (!(arg == "false" || arg == "true")) {
                    sendValidationErrorMessage(message,
                        `Expected true/false value for \`${validation.name}\`.`,
                        arg);
                    return false;
                }
                break;
            case "enum":
                let enums = validation.enums;
                arg = arg.toLowerCase();
                if (!enums.includes(arg)) {
                    sendValidationErrorMessage(message,
                        `Expected one of the following valid \`${validation.name}\` values: (${arrayToString(enums)}).`,
                        arg);
                    return false;
                }
                break;
            case "char":
                if (arg.length !== 1) {
                    sendValidationErrorMessage(message,
                        `Expected a character for \`${validation.name}\`.`,
                        arg);
                    return false;
                }
                break;
            default:
                logger.error(`Undefined argument type. ${validation}`);
        }
    }
    return true;
}

const arrayToString = (elements) => {
    elements = elements.map(element => `\`${element}\``);
    if (elements.length == 1) return elements[0];
    let lastElement = elements.splice(-1);
    return `${elements.join(", ")} and ${lastElement}`
}

const sendValidationErrorMessage = (message, warning, arg) => {
    sendErrorMessage(message, "Input validation error", warning);
    logger.warn(`${getDebugContext(message)} | ${warning}. val = ${arg}`);
}
