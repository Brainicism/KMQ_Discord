import Eris from "eris";
import * as uuid from "uuid";

import {
    getDebugLogHeader,
    sendErrorMessage,
    sendOptionsMessage,
} from "../../helpers/discord_utils";
import { getGuildPreference } from "../../helpers/game_utils";
import validate from "../../helpers/validate";
import { state } from "../../kmq_worker";
import { IPCLogger } from "../../logger";
import MessageContext from "../../structures/message_context";
import { EnvType, GuildTextableMessage, ParsedMessage } from "../../types";

const logger = new IPCLogger("messageCreate");

function isGuildMessage(
    message: Eris.Message
): message is GuildTextableMessage {
    return message.channel instanceof Eris.TextChannel;
}

const parseMessage = (message: string): ParsedMessage => {
    if (message.charAt(0) !== process.env.BOT_PREFIX) return null;
    const components = message.split(/\s+/);
    const action = components.shift().substring(1).toLowerCase();
    const argument = components.join(" ");
    return {
        action,
        argument,
        components,
        message,
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
    if (state.client.unavailableGuilds.has(message.guildID)) {
        logger.warn(`Server was unavailable. id = ${message.guildID}`);
        return;
    }

    const parsedMessage = parseMessage(message.content) || null;
    const textChannel = message.channel as Eris.TextChannel;
    if (
        message.mentions.includes(state.client.user) &&
        message.content.split(" ").length === 1
    ) {
        // Any message that mentions the bot sends the current options
        const guildPreference = await getGuildPreference(message.guildID);
        sendOptionsMessage(
            MessageContext.fromMessage(message),
            guildPreference,
            null
        );
        return;
    }

    const invokedCommand = parsedMessage
        ? state.client.commands[parsedMessage.action]
        : null;

    if (invokedCommand) {
        if (!state.rateLimiter.check(message.author.id)) {
            logger.error(
                `User ${
                    message.author.id
                } is being rate limited. ${state.rateLimiter.timeRemaining(
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
            const { gameSessions } = state;
            const gameSession = gameSessions[message.guildID];
            if (invokedCommand.preRunChecks) {
                for (const precheck of invokedCommand.preRunChecks) {
                    if (
                        !(await precheck.checkFn({
                            errorMessage: precheck.errorMessage,
                            gameSession,
                            message,
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
                    gameSessions,
                    message,
                    parsedMessage,
                });
            } catch (e) {
                const debugId = uuid.v4();
                logger.error(
                    `Error while invoking command (${
                        parsedMessage.action
                    }) | ${debugId} | ${JSON.stringify(e)}`
                );

                if (process.env.NODE_ENV === EnvType.DEV) {
                    logger.error(e.stack);
                }

                sendErrorMessage(MessageContext.fromMessage(message), {
                    description: state.localizer.translate(
                        message.guildID,
                        "misc.failure.command.description",
                        { debugId }
                    ),
                    title: state.localizer.translate(
                        message.guildID,
                        "misc.failure.command.title"
                    ),
                });
            }
        }
    } else if (state.gameSessions[message.guildID]?.round) {
        const gameSession = state.gameSessions[message.guildID];
        gameSession.guessSong(
            MessageContext.fromMessage(message),
            message.content
        );
    }
}
