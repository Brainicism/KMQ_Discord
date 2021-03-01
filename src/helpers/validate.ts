import { getDebugLogHeader, sendErrorMessage, getMessageContext } from "./discord_utils";
import { GuildTextableMessage, ParsedMessage } from "../types";
import { CommandValidations } from "../commands/base_command";
import _logger from "../logger";
import { arrayToString } from "./utils";

const logger = _logger("validate");

/**
 * @param message - the Message object
 * @param warning - the warning text
 * @param arg - The incorrect argument
 */
async function sendValidationErrorMessage(message: GuildTextableMessage, warning: string, arg: string | Array<string>) {
    await sendErrorMessage(getMessageContext(message), { title: "Input validation error", description: warning });
    logger.warn(`${getDebugLogHeader(message)} | ${warning}. val = ${arg}`);
}

export default (message: GuildTextableMessage, parsedMessage: ParsedMessage, validations: CommandValidations) => {
    if (!validations) return true;
    const args = parsedMessage.components;
    if (args.length > validations.maxArgCount || args.length < validations.minArgCount) {
        sendValidationErrorMessage(message,
            `Incorrect number of arguments. See \`${process.env.BOT_PREFIX}help ${parsedMessage.action}\` for usage.`,
            args);
        return false;
    }
    for (let i = 0; i < args.length; i++) {
        const validation = validations.arguments[i];
        if (!validation) continue;
        let arg = args[i];
        // check arg type
        switch (validation.type) {
            case "number": {
                if (Number.isNaN(Number(arg))) {
                    sendValidationErrorMessage(message,
                        `Expected numeric value for \`${validation.name}\`.`,
                        arg);
                    return false;
                }
                // parse as integer for now, might cause problems later?
                const intArg = parseInt(arg, 10);
                if ("minValue" in validation && intArg < validation.minValue) {
                    sendValidationErrorMessage(message,
                        `Expected value greater than \`${validation.minValue}\` for \`${validation.name}\`.`,
                        arg);
                    return false;
                }
                if ("maxValue" in validation && intArg > validation.maxValue) {
                    sendValidationErrorMessage(message,
                        `Expected value less than or equal to \`${validation.maxValue}\` for \`${validation.name}\`.`,
                        arg);
                    return false;
                }
                break;
            }
            case "boolean": {
                arg = arg.toLowerCase();
                if (!(arg === "false" || arg === "true")) {
                    sendValidationErrorMessage(message,
                        `Expected true/false value for \`${validation.name}\`.`,
                        arg);
                    return false;
                }
                break;
            }
            case "enum": {
                const { enums } = validation;
                arg = arg.toLowerCase();
                if (!enums.includes(arg)) {
                    sendValidationErrorMessage(message,
                        `Expected one of the following valid \`${validation.name}\` values: (${arrayToString(enums)}).`,
                        arg);
                    return false;
                }
                args[i] = arg;
                break;
            }
            case "char": {
                if (arg.length !== 1) {
                    sendValidationErrorMessage(message,
                        `Expected a character for \`${validation.name}\`.`,
                        arg);
                    return false;
                }
                break;
            }
            default: {
                logger.error(`Undefined argument type. ${validation}`);
            }
        }
    }
    return true;
};
