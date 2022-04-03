import { CommandValidations } from "../commands/interfaces/base_command";
import { state } from "../kmq_worker";
import { IPCLogger } from "../logger";
import MessageContext from "../structures/message_context";
import { GuildTextableMessage, ParsedMessage } from "../types";
import { getDebugLogHeader, sendErrorMessage } from "./discord_utils";
import { arrayToString } from "./utils";

const logger = new IPCLogger("validate");

/**
 * @param message - the Message object
 * @param warning - the warning text
 * @param arg - The incorrect argument
 * @param usage - The usage instructions
 */
export async function sendValidationErrorMessage(
    message: GuildTextableMessage,
    warning: string,
    arg: string | Array<string>,
    usage?: string
): Promise<void> {
    await sendErrorMessage(MessageContext.fromMessage(message), {
        description: warning,
        footerText: usage,
        title: state.localizer.translate(
            message.guildID,
            "misc.failure.validation.title"
        ),
    });
    logger.warn(`${getDebugLogHeader(message)} | ${warning}. val = ${arg}`);
}

export default (
    message: GuildTextableMessage,
    parsedMessage: ParsedMessage,
    validations: CommandValidations,
    usage?: string
): boolean => {
    if (!validations) return true;
    const args = parsedMessage.components;
    if (
        args.length > validations.maxArgCount ||
        args.length < validations.minArgCount
    ) {
        sendValidationErrorMessage(
            message,
            state.localizer.translate(
                message.guildID,
                "misc.failure.validation.numArguments.incorrect",
                {
                    command: parsedMessage.action,
                    help: `${process.env.BOT_PREFIX}help`,
                }
            ),
            args,
            usage
        );
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
                    sendValidationErrorMessage(
                        message,
                        state.localizer.translate(
                            message.guildID,
                            "misc.failure.validation.number.notNumber",
                            { argument: `\`${validation.name}\`` }
                        ),
                        arg,
                        usage
                    );
                    return false;
                }

                // parse as integer for now, might cause problems later?
                const intArg = parseInt(arg);
                if ("minValue" in validation && intArg < validation.minValue) {
                    sendValidationErrorMessage(
                        message,
                        state.localizer.translate(
                            message.guildID,
                            "misc.failure.validation.number.min",
                            {
                                argument: `\`${validation.name}\``,
                                min: `\`${validation.minValue}\``,
                            }
                        ),
                        arg,
                        usage
                    );
                    return false;
                }

                if ("maxValue" in validation && intArg > validation.maxValue) {
                    sendValidationErrorMessage(
                        message,
                        state.localizer.translate(
                            message.guildID,
                            "misc.failure.validation.number.max",
                            {
                                argument: `\`${validation.name}\``,
                                max: `\`${validation.maxValue}\``,
                            }
                        ),
                        arg,
                        usage
                    );
                    return false;
                }

                break;
            }

            case "boolean": {
                arg = arg.toLowerCase();
                if (!(arg === "false" || arg === "true")) {
                    sendValidationErrorMessage(
                        message,
                        state.localizer.translate(
                            message.guildID,
                            "misc.failure.validation.boolean.notBoolean",
                            { argument: `\`${validation.name}\`` }
                        ),
                        arg,
                        usage
                    );
                    return false;
                }

                break;
            }

            case "enum": {
                const { enums } = validation;
                arg = arg.toLowerCase();
                if (!enums.includes(arg)) {
                    sendValidationErrorMessage(
                        message,
                        state.localizer.translate(
                            message.guildID,
                            "misc.failure.validation.enum.notInEnum",
                            {
                                argument: `\`${validation.name}\``,
                                validValues: arrayToString(enums),
                            }
                        ),
                        arg,
                        usage
                    );
                    return false;
                }

                args[i] = arg;
                break;
            }

            case "char": {
                if (arg.length !== 1) {
                    sendValidationErrorMessage(
                        message,
                        state.localizer.translate(
                            message.guildID,
                            "misc.failure.validation.char.notChar",
                            { argument: `\`${validation.name}\`` }
                        ),
                        arg,
                        usage
                    );
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
