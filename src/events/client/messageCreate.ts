import * as uuid from "uuid";
import { IPCLogger } from "../../logger";
import {
    getAllClickableSlashCommands,
    getDebugLogHeader,
    sendErrorMessage,
    sendOptionsMessage,
} from "../../helpers/discord_utils";
import CommandPrechecks from "../../command_prechecks";
import Eris from "eris";
import GuildPreference from "../../structures/guild_preference";
import MessageContext from "../../structures/message_context";
import Session from "../../structures/session";
import State from "../../state";
import i18n from "../../helpers/localization_manager";
import validate from "../../helpers/validate";
import type { GuildTextableMessage } from "../../types";
import type ParsedMessage from "../../interfaces/parsed_message";
import type PrecheckArgs from "../../interfaces/precheck_args";

const logger = new IPCLogger("messageCreate");

function isGuildMessage(
    message: Eris.Message,
): message is GuildTextableMessage {
    return (
        message.channel instanceof Eris.TextChannel ||
        message.channel instanceof Eris.TextVoiceChannel ||
        message.channel instanceof Eris.ThreadChannel
    );
}

const parseMessage = (message: string): ParsedMessage | null => {
    if (message.charAt(0) !== process.env.BOT_PREFIX) return null;
    const components = message.split(/\s+/);
    const action = components.shift()!.substring(1).toLowerCase();
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
    message: Eris.Message,
): Promise<void> {
    if (message.author.id === process.env.BOT_CLIENT_ID || message.author.bot)
        return;
    if (!isGuildMessage(message)) return;
    if (State.client.unavailableGuilds.has(message.guildID)) {
        logger.warn(`Server was unavailable. id = ${message.guildID}`);
        return;
    }

    const parsedMessage = parseMessage(message.content);
    const textChannel = message.channel as Eris.TextChannel;
    const messageContext = MessageContext.fromMessage(message);
    if (
        message.mentions.includes(State.client.user) &&
        message.content.split(" ").length === 1
    ) {
        // Any message that mentions the bot sends the current options
        const guildPreference = await GuildPreference.getGuildPreference(
            message.guildID,
        );

        sendOptionsMessage(
            Session.getSession(message.guildID),
            messageContext,
            guildPreference,
            [],
        );
        return;
    }

    const invokedCommand = parsedMessage
        ? State.client.commands[parsedMessage.action] ||
          State.client.aliases[parsedMessage.action]
        : null;

    const session = Session.getSession(message.guildID);
    if (parsedMessage && invokedCommand) {
        if (State.bannedServers.has(message.guildID)) {
            logger.warn(
                `Banned server attempted to execute command. id = ${message.guildID}`,
            );

            await sendErrorMessage(messageContext, {
                title: i18n.translate(
                    messageContext.guildID,
                    "misc.interaction.title.failure",
                ),
                description: i18n.translate(
                    messageContext.guildID,
                    "misc.failure.interaction.guildBanned",
                    {
                        supportServer: "https://discord.gg/RCuzwYV",
                    },
                ),
            });
            return;
        }

        if (State.bannedPlayers.has(message.author.id)) {
            logger.warn(
                `Banned player attempted to execute command. id = ${message.author.id}`,
            );

            await sendErrorMessage(messageContext, {
                title: i18n.translate(
                    messageContext.guildID,
                    "misc.interaction.title.failure",
                ),
                description: i18n.translate(
                    messageContext.guildID,
                    "misc.failure.interaction.playerBanned",
                    {
                        supportServer: "https://discord.gg/RCuzwYV",
                    },
                ),
            });
            return;
        }

        if (!State.rateLimiter.check(message.author.id)) {
            logger.error(
                `User ${
                    message.author.id
                } is being rate limited. ${State.rateLimiter.timeRemaining(
                    message.author.id,
                )}ms remaining.`,
            );
            return;
        }

        if (
            validate(
                message,
                parsedMessage,
                invokedCommand.validations ?? null,
                typeof invokedCommand.help === "function"
                    ? getAllClickableSlashCommands(
                          invokedCommand.help(message.guildID).name,
                      )
                    : undefined,
            )
        ) {
            const prechecks: Array<{
                checkFn: (
                    precheckArgs: PrecheckArgs,
                ) => boolean | Promise<boolean>;
                errorMessage?: string;
            }> = [
                {
                    checkFn: CommandPrechecks.maintenancePrecheck,
                    errorMessage: undefined,
                },
            ];

            if (invokedCommand.preRunChecks) {
                prechecks.push(...invokedCommand.preRunChecks);
            }

            for (const precheck of prechecks) {
                if (
                    // eslint-disable-next-line no-await-in-loop
                    !(await precheck.checkFn({
                        messageContext,
                        session,
                        errorMessage: precheck.errorMessage,
                        parsedMessage,
                    }))
                ) {
                    return;
                }
            }

            logger.info(
                `${getDebugLogHeader(message)} | Invoked command '${
                    parsedMessage.action
                }'.`,
            );

            try {
                await invokedCommand.call({
                    channel: textChannel,
                    message,
                    parsedMessage,
                });
            } catch (err) {
                const debugId = uuid.v4();

                logger.error(
                    `${getDebugLogHeader(
                        messageContext,
                    )} | Error while invoking command (${
                        parsedMessage.action
                    }) | ${debugId} | Exception Name: ${err.name}. Reason: ${
                        err.message
                    }. Trace: ${err.stack}}`,
                );

                await sendErrorMessage(messageContext, {
                    title: i18n.translate(
                        messageContext.guildID,
                        "misc.failure.command.title",
                    ),
                    description: i18n.translate(
                        messageContext.guildID,
                        "misc.failure.command.description",
                        { debugId },
                    ),
                });
                const newSession = Session.getSession(message.guildID);

                if (newSession) {
                    await newSession.endSession(
                        "Unknown error during command invocation, cleaning up",
                        true,
                    );
                }
            }
        }
    } else if (
        session?.isGameSession() &&
        !session.isHiddenMode() &&
        !session.isMultipleChoiceMode()
    ) {
        if (State.bannedPlayers.has(message.author.id)) {
            return;
        }

        session.guessSong(messageContext, message.content, message.createdAt);
    }
}
