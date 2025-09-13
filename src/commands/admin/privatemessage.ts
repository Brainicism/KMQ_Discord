import { IPCLogger } from "../../logger.js";
import {
    sendDmMessage,
    sendErrorMessage,
    sendInfoMessage,
} from "../../helpers/discord_utils.js";
import CommandPrechecks from "../../command_prechecks.js";
import LocaleType from "../../enums/locale_type.js";
import MessageContext from "../../structures/message_context.js";
import i18n from "../../helpers/localization_manager.js";
import type { TextableChannel } from "eris";
import type BaseCommand from "../interfaces/base_command.js";
import type CommandArgs from "../../interfaces/command_args.js";
import type Eris from "eris";

const logger = new IPCLogger("privatemessage");

// eslint-disable-next-line import/no-unused-modules
export default class PrivateMessageCommand implements BaseCommand {
    preRunChecks = [{ checkFn: CommandPrechecks.userAdminPrecheck }];

    call = async ({ message, parsedMessage }: CommandArgs): Promise<void> => {
        const components = parsedMessage.components;
        const messageContext = MessageContext.fromMessage(message);
        if (components.length < 2) {
            logger.warn("privatemessage requires a user ID and message");
            return;
        }

        const userID = components[0];
        components.shift();
        const messageToSend = components.join(" ");

        const result = await PrivateMessageCommand.sendPrivateMessage(
            userID!,
            messageToSend,
        );

        if (!result) {
            logger.warn(`Failed to send private message to ${userID}`);
            await sendErrorMessage(messageContext, {
                title: "Error",
                description: `Failed to send private message to ${userID}`,
            });

            return;
        }

        await sendInfoMessage(messageContext, {
            title: "Success",
            description: `Sent private message to ${userID}`,
        });
    };

    static async sendPrivateMessage(
        userID: string,
        messageToSend: string,
    ): Promise<Eris.Message<TextableChannel> | null> {
        return sendDmMessage(userID!, {
            embeds: [
                {
                    description: `${messageToSend}\n\n${i18n.translate(
                        LocaleType.EN,
                        "command.privateMessage.disclaimer",
                        {
                            supportServer: "https://discord.gg/RCuzwYV",
                        },
                    )}`,
                },
            ],
        });
    }
}
