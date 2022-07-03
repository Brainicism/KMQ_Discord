import * as uuid from "uuid";
import { IPCLogger } from "../../logger";
import {
    getDebugLogHeader,
    sendErrorMessage,
    sendOptionsMessage,
} from "../../helpers/discord_utils";
import Eris from "eris";
import GuildPreference from "../../structures/guild_preference";
import LocalizationManager from "../../helpers/localization_manager";
import MessageContext from "../../structures/message_context";
import Session from "../../structures/session";
import State from "../../state";
import validate from "../../helpers/validate";
import type { GuildTextableMessage } from "../../types";
import type ParsedMessage from "../../interfaces/parsed_message";

const logger = new IPCLogger("messageCreate");

function isGuildMessage(
    message: Eris.Message
): message is GuildTextableMessage {
    return (
        message.channel instanceof Eris.TextChannel ||
        message.channel instanceof Eris.TextVoiceChannel ||
        message.channel instanceof Eris.ThreadChannel
    );
}

const parseMessage = (message: string): ParsedMessage => {
    if (message.charAt(0) !== process.env.BOT_PREFIX) return null;
    const components = message.split(/\s+/);
    const action = components.shift().substring(1).toLowerCase();
    const argument = components.join(" ");
    return {
        action,
        argument,
        message,
        components,
    };
};

/**
 * Handles the 'messageCreate' event
 * @param message - The original message
 */
export default async function messageCreateHandler(
    message: Eris.Message
): Promise<void> {
    if (message.author.id === process.env.BOT_CLIENT_ID || message.author.bot)
        return;
    if (!isGuildMessage(message)) return;
    if (State.client.unavailableGuilds.has(message.guildID)) {
        logger.warn(`Server was unavailable. id = ${message.guildID}`);
        return;
    }

    const parsedMessage = parseMessage(message.content) || null;
    const textChannel = message.channel as Eris.TextChannel;
    const messageContext = MessageContext.fromMessage(message);
    if (
        message.mentions.includes(State.client.user) &&
        message.content.split(" ").length === 1
    ) {
        // Any message that mentions the bot sends the current options
        const guildPreference = await GuildPreference.getGuildPreference(
            message.guildID
        );

        sendOptionsMessage(
            Session.getSession(message.guildID),
            messageContext,
            guildPreference,
            null
        );
        return;
    }

    const invokedCommand = parsedMessage
        ? State.client.commands[parsedMessage.action]
        : null;

    const session = Session.getSession(message.guildID);
    if (invokedCommand) {
        if (!State.rateLimiter.check(message.author.id)) {
            logger.error(
                `User ${
                    message.author.id
                } is being rate limited. ${State.rateLimiter.timeRemaining(
                    message.author.id
                )}ms remaining.`
            );
            return;
        }

        if (
            validate(
                message,
                parsedMessage,
                invokedCommand.validations,
                typeof invokedCommand.help === "function"
                    ? invokedCommand.help(message.guildID).usage
                    : null
            )
        ) {
            if (invokedCommand.preRunChecks) {
                for (const precheck of invokedCommand.preRunChecks) {
                    if (
                        // eslint-disable-next-line no-await-in-loop
                        !(await precheck.checkFn({
                            message,
                            session,
                            errorMessage: precheck.errorMessage,
                        }))
                    ) {
                        return;
                    }
                }
            }

            logger.info(
                `${getDebugLogHeader(message)} | Invoked command '${
                    parsedMessage.action
                }'.`
            );

            try {
                await invokedCommand.call({
                    channel: textChannel,
                    message,
                    parsedMessage,
                });
            } catch (err) {
                const debugId = uuid.v4();

                if (err instanceof Error) {
                    logger.error(
                        `Error while invoking command (${parsedMessage.action}) | ${debugId} | Exception Name: ${err.name}. Reason: ${err.message}. Trace: ${err.stack}}`
                    );
                } else {
                    logger.error(
                        `Error while invoking command (${parsedMessage.action}) | ${debugId} | Error: ${err}`
                    );
                }

                sendErrorMessage(messageContext, {
                    title: LocalizationManager.localizer.translate(
                        message.guildID,
                        "misc.failure.command.title"
                    ),
                    description: LocalizationManager.localizer.translate(
                        message.guildID,
                        "misc.failure.command.description",
                        { debugId }
                    ),
                });
            }
        }
    } else if (session?.isGameSession() && session.round) {
        session.guessSong(messageContext, message.content);
    }
}
