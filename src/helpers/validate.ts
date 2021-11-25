import { getDebugLogHeader, sendErrorMessage } from "./discord_utils";
import { GuildTextableMessage, ParsedMessage } from "../types";
import { CommandValidations } from "../commands/interfaces/base_command";
import { IPCLogger } from "../logger";
import { arrayToString } from "./utils";
import MessageContext from "../structures/message_context";

const logger = new IPCLogger("validate");

/**
 * @param message - the Message object
 * @param warning - the warning text
 * @param arg - The incorrect argument
 * @param usage - The usage instructions
 */
export async function sendValidationErrorMessage(message: GuildTextableMessage, warning: string, arg: string | Array<string>, usage?: string): Promise<void> {
    await sendErrorMessage(MessageContext.fromMessage(message), { title: "Input validation error", description: warning, footerText: usage });
    logger.warn(`${getDebugLogHeader(message)} | ${warning}. val = ${arg}`);
}

export default (message: GuildTextableMessage, parsedMessage: ParsedMessage, validations: CommandValidations, usage?: string): boolean => {
    if (!validations) return true;
    const args = parsedMessage.components;
    if (args.length > validations.maxArgCount || args.length < validations.minArgCount) {
        sendValidationErrorMessage(message,
            `Incorrect number of arguments. See \`${process.env.BOT_PREFIX}help ${parsedMessage.action}\` for usage.`,
            args,
            usage);
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
                        arg,
                        usage);
                    return false;
                }

                // parse as integer for now, might cause problems later?
                const intArg = parseInt(arg);
                if ("minValue" in validation && intArg < validation.minValue) {
                    sendValidationErrorMessage(message,
                        `Expected value greater than \`${validation.minValue}\` for \`${validation.name}\`.`,
                        arg,
                        usage);
                    return false;
                }

                if ("maxValue" in validation && intArg > validation.maxValue) {
                    sendValidationErrorMessage(message,
                        `Expected value less than or equal to \`${validation.maxValue}\` for \`${validation.name}\`.`,
                        arg,
                        usage);
                    return false;
                }

                break;
            }

            case "boolean": {
                arg = arg.toLowerCase();
                if (!(arg === "false" || arg === "true")) {
                    sendValidationErrorMessage(message,
                        `Expected true/false value for \`${validation.name}\`.`,
                        arg,
                        usage);
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
                        arg,
                        usage);
                    return false;
                }

                args[i] = arg;
                break;
            }

            case "char": {
                if (arg.length !== 1) {
                    sendValidationErrorMessage(message,
                        `Expected a character for \`${validation.name}\`.`,
                        arg,
                        usage);
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
