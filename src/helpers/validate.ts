/* eslint-disable no-await-in-loop */
import { IPCLogger } from "../logger.js";
import { arrayToString } from "./utils.js";
import {
    clickableSlashCommand,
    getDebugLogHeader,
    sendErrorMessage,
} from "./discord_utils.js";
import MessageContext from "../structures/message_context.js";
import i18n from "./localization_manager.js";
import type { GuildTextableMessage } from "../types.js";
import type CommandValidations from "../interfaces/command_validations.js";
import type Eris from "eris";
import type ParsedMessage from "../interfaces/parsed_message.js";

const logger = new IPCLogger("validate");

/**
 * @param messageContext - the message context
 * @param warning - the warning text
 * @param arg - The incorrect argument
 * @param usage - The usage instructions
 * @param interaction - The interaction that failed validation
 */
export async function sendValidationErrorMessage(
    messageContext: MessageContext,
    warning: string,
    arg: string | Array<string>,
    usage?: string,
    interaction?: Eris.CommandInteraction,
): Promise<void> {
    let description = warning;
    if (usage) {
        description += `\n\n${usage}`;
    }

    await sendErrorMessage(
        messageContext,
        {
            title: i18n.translate(
                messageContext.guildID,
                "misc.failure.validation.title",
            ),
            description,
        },
        interaction,
    );

    logger.warn(
        `${getDebugLogHeader(messageContext)} | ${warning}. val = ${arg}`,
    );
}

export default async (
    message: GuildTextableMessage,
    parsedMessage: ParsedMessage,
    validations: CommandValidations | null,
    usage?: string,
): Promise<boolean> => {
    if (!validations) return true;
    const args = parsedMessage.components;
    const messageContext = MessageContext.fromMessage(message);
    if (
        (validations.maxArgCount && args.length > validations.maxArgCount) ||
        args.length < validations.minArgCount
    ) {
        await sendValidationErrorMessage(
            messageContext,
            i18n.translate(
                message.guildID,
                "misc.failure.validation.numArguments.incorrect",
                {
                    help: clickableSlashCommand("help"),
                    command: parsedMessage.action,
                },
            ),
            args,
            usage,
        );
        return false;
    }

    for (let i = 0; i < args.length; i++) {
        const validation = validations.arguments[i];
        if (!validation) continue;
        let arg = args[i]!;
        // check arg type
        switch (validation.type) {
            case "int":
            case "float": {
                if (Number.isNaN(Number(arg))) {
                    await sendValidationErrorMessage(
                        messageContext,
                        i18n.translate(
                            message.guildID,
                            "misc.failure.validation.number.notNumber",
                            { argument: `\`${validation.name}\`` },
                        ),
                        arg,
                        usage,
                    );
                    return false;
                }

                const numArg =
                    validation.type === "int"
                        ? parseInt(arg, 10)
                        : parseFloat(arg);

                if (
                    validation.minValue != null &&
                    numArg < validation.minValue
                ) {
                    await sendValidationErrorMessage(
                        messageContext,
                        i18n.translate(
                            message.guildID,
                            "misc.failure.validation.number.min",
                            {
                                min: `\`${validation.minValue}\``,
                                argument: `\`${validation.name}\``,
                            },
                        ),
                        arg,
                        usage,
                    );
                    return false;
                }

                if (
                    validation.maxValue != null &&
                    numArg > validation.maxValue
                ) {
                    await sendValidationErrorMessage(
                        messageContext,
                        i18n.translate(
                            message.guildID,
                            "misc.failure.validation.number.max",
                            {
                                max: `\`${validation.maxValue}\``,
                                argument: `\`${validation.name}\``,
                            },
                        ),
                        arg,
                        usage,
                    );
                    return false;
                }

                break;
            }

            case "boolean": {
                arg = arg.toLowerCase();
                if (!(arg === "false" || arg === "true")) {
                    await sendValidationErrorMessage(
                        messageContext,
                        i18n.translate(
                            message.guildID,
                            "misc.failure.validation.boolean.notBoolean",
                            { argument: `\`${validation.name}\`` },
                        ),
                        arg,
                        usage,
                    );
                    return false;
                }

                break;
            }

            case "enum": {
                const { enums } = validation;
                if (enums) {
                    arg = arg.toLowerCase();
                    if (!enums.includes(arg)) {
                        await sendValidationErrorMessage(
                            messageContext,
                            i18n.translate(
                                message.guildID,
                                "misc.failure.validation.enum.notInEnum",
                                {
                                    argument: `\`${validation.name}\``,
                                    validValues: arrayToString(enums),
                                },
                            ),
                            arg,
                            usage,
                        );
                        return false;
                    }
                }

                args[i] = arg;
                break;
            }

            case "char": {
                if (arg.length !== 1) {
                    await sendValidationErrorMessage(
                        messageContext,
                        i18n.translate(
                            message.guildID,
                            "misc.failure.validation.char.notChar",
                            { argument: `\`${validation.name}\`` },
                        ),
                        arg,
                        usage,
                    );
                    return false;
                }

                break;
            }

            case "string": {
                return true;
            }

            default: {
                logger.error(`Undefined argument type. ${validation}`);
            }
        }
    }

    return true;
};
