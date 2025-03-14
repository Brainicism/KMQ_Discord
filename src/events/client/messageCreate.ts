import * as uuid from "uuid";
import { IPCLogger } from "../../logger";
import { extractErrorString } from "../../helpers/utils";
import {
    fetchChannel,
    getAllClickableSlashCommands,
    getDebugLogHeader,
    sendErrorMessage,
    sendOptionsMessage,
} from "../../helpers/discord_utils";
import CommandPrechecks from "../../command_prechecks";
import Eris from "eris";
import GuildPreference from "../../structures/guild_preference";
import KmqConfiguration from "../../kmq_configuration";
import MessageContext from "../../structures/message_context";
import PrivateMessageCommand from "../../commands/admin/privatemessage";
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
    // dont respond to self
    if (message.author.id === process.env.BOT_CLIENT_ID) {
        return;
    }

    // dont respond to bots unless test bot
    if (
        message.author.bot &&
        message.author.id !== process.env.END_TO_END_TEST_BOT_CLIENT
    ) {
        return;
    }

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (message.guildID === undefined) {
        logger.debug(`Message received in DMs. msg = ${message.content}`);

        await PrivateMessageCommand.sendPrivateMessage(message.author.id, "");
        return;
    }

    if (!isGuildMessage(message)) {
        // if channel is unexpectedly partial
        if ((message.channel.type as number | undefined) === undefined) {
            logger.warn(
                `Unexpectedly received partial channel: ${message.channel.id}`,
            );

            if (KmqConfiguration.Instance.partialChannelFetchingEnabled()) {
                // fetch channel for next time
                const fetchedChannel = await fetchChannel(message.channel.id);
                if (!fetchedChannel) {
                    logger.warn(
                        `Failed to fetch partial channel: ${message.channel.id}`,
                    );
                }
            }
        }

        return;
    }

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

        await sendOptionsMessage(
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
        const hrstart = process.hrtime();
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

        logger.info(
            `${getDebugLogHeader(message)} | Invoked command '${
                parsedMessage.action
            }' (${message.id}).`,
        );

        if (
            message.author.id !== process.env.END_TO_END_TEST_BOT_CLIENT &&
            !State.rateLimiter.check(message.author.id)
        ) {
            logger.warn(
                `User ${
                    message.author.id
                } is being rate limited. ${State.rateLimiter.timeRemaining(
                    message.author.id,
                )}ms remaining.`,
            );
            return;
        }

        if (
            await validate(
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
                        `${getDebugLogHeader(
                            messageContext,
                        )} | Error while invoking command (${
                            parsedMessage.action
                        }) | id: ${message.id} | ${debugId} | Data: "${parsedMessage.argument}" | ${extractErrorString(err)}`,
                    );
                } else {
                    logger.error(
                        `${getDebugLogHeader(
                            messageContext,
                        )} | Error while invoking command (${
                            parsedMessage.action
                        }) | id: ${message.id} | ${debugId} | Data: "${parsedMessage.argument}" | err = ${err}`,
                    );
                }

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

        const hrend = process.hrtime(hrstart);
        const executionTime = hrend[0] * 1000 + hrend[1] / 1000000;
        logger.info(
            `${parsedMessage.action} (${message.id}) took ${executionTime}ms`,
        );
    } else if (
        session?.isGameSession() &&
        !session.isHiddenMode() &&
        !session.isMultipleChoiceMode()
    ) {
        if (State.bannedPlayers.has(message.author.id)) {
            return;
        }

        try {
            await session.guessSong(
                messageContext,
                message.content,
                message.createdAt,
            );
        } catch (e) {
            const debugId = uuid.v4();

            logger.error(
                `Error during session.guessSong(). Debug ID: ${debugId}. Name: ${e.name}. Reason: ${e.message}. Trace: ${e.stack}}}`,
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
        }
    }
}
