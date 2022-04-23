import { getDebugLogHeader, sendErrorMessage } from "./discord_utils";
import type { GuildTextableMessage } from "../types";
import { IPCLogger } from "../logger";
import { arrayToString } from "./utils";
import MessageContext from "../structures/message_context";
import State from "../state";
import type ParsedMessage from "../interfaces/parsed_message";
import type CommandValidations from "../interfaces/command_validations";

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
        title: State.localizer.translate(
            message.guildID,
            "misc.failure.validation.title"
        ),
        description: warning,
        footerText: usage,
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
            State.localizer.translate(
                message.guildID,
                "misc.failure.validation.numArguments.incorrect",
                {
                    help: `${process.env.BOT_PREFIX}help`,
                    command: parsedMessage.action,
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
                        State.localizer.translate(
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
                        State.localizer.translate(
                            message.guildID,
                            "misc.failure.validation.number.min",
                            {
                                min: `\`${validation.minValue}\``,
                                argument: `\`${validation.name}\``,
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
                        State.localizer.translate(
                            message.guildID,
                            "misc.failure.validation.number.max",
                            {
                                max: `\`${validation.maxValue}\``,
                                argument: `\`${validation.name}\``,
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
                        State.localizer.translate(
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
                        State.localizer.translate(
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
                        State.localizer.translate(
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
