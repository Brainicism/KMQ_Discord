import { EMBED_SUCCESS_BONUS_COLOR, KmqImages } from "../../constants";
import { IPCLogger } from "../../logger";
import { areUsersPremium } from "../../helpers/game_utils";
import {
    generateOptionsMessage,
    getCurrentVoiceMembers,
    getDebugLogHeader,
    getGameInfoMessage,
    getUserVoiceChannel,
    notifyOptionsGenerationError,
    sendErrorMessage,
    sendInfoMessage,
    voicePermissionsCheck,
} from "../../helpers/discord_utils";
import CommandPrechecks from "../../command_prechecks";
import Eris from "eris";
import GuildPreference from "../../structures/guild_preference";
import KmqMember from "../../structures/kmq_member";
import ListeningSession from "../../structures/listening_session";
import MessageContext from "../../structures/message_context";
import Session from "../../structures/session";
import State from "../../state";
import i18n from "../../helpers/localization_manager";
import type { DefaultSlashCommand } from "../interfaces/base_command";
import type BaseCommand from "../interfaces/base_command";
import type CommandArgs from "../../interfaces/command_args";
import type HelpDocumentation from "../../interfaces/help";

const logger = new IPCLogger("listen");

/**
 * Sends the beginning of game session message
 * @param textChannelName - The name of the text channel to send the message to
 * @param voiceChannelName - The name of the voice channel to join
 * @param messageContext - The original message that triggered the command
 * @param guildPreference - The guild's preferences
 * @param interaction - The interaction
 */
export async function sendBeginListeningSessionMessage(
    textChannelName: string,
    voiceChannelName: string,
    messageContext: MessageContext,
    guildPreference: GuildPreference,
    interaction?: Eris.CommandInteraction
): Promise<void> {
    const startTitle = i18n.translate(
        messageContext.guildID,
        "command.listen.musicStarting",
        {
            textChannelName,
            voiceChannelName,
        }
    );

    const gameInfoMessage = await getGameInfoMessage(messageContext.guildID);

    const fields: Eris.EmbedField[] = [];
    if (gameInfoMessage) {
        fields.push({
            name: gameInfoMessage.title,
            value: gameInfoMessage.message,
            inline: false,
        });
    }

    const optionsEmbedPayload = await generateOptionsMessage(
        Session.getSession(messageContext.guildID),
        messageContext,
        guildPreference,
        [],
        false,
        false
    );

    const additionalPayloads = [];
    if (optionsEmbedPayload) {
        additionalPayloads.push(optionsEmbedPayload);
    } else {
        await notifyOptionsGenerationError(messageContext, "listen");
    }

    await sendInfoMessage(
        messageContext,
        {
            title: startTitle,
            color: EMBED_SUCCESS_BONUS_COLOR,
            thumbnailUrl: KmqImages.HAPPY,
            fields,
        },
        false,
        undefined,
        additionalPayloads,
        interaction
    );
}

export default class ListenCommand implements BaseCommand {
    preRunChecks = [
        { checkFn: CommandPrechecks.notRestartingPrecheck },
        { checkFn: CommandPrechecks.maintenancePrecheck },
        { checkFn: CommandPrechecks.notListeningPrecheck },
        { checkFn: CommandPrechecks.notInGamePrecheck },
    ];

    validations = {
        minArgCount: 0,
        maxArgCount: 0,
        arguments: [],
    };

    aliases = ["radio", "music"];

    help = (guildID: string): HelpDocumentation => ({
        name: "listen",
        description: i18n.translate(guildID, "command.listen.help.description"),
        usage: "/listen",
        priority: 1040,
        examples: [
            {
                example: "`/listen`",
                explanation: i18n.translate(
                    guildID,
                    "command.listen.help.example"
                ),
            },
        ],
    });

    slashCommands = (): Array<
        DefaultSlashCommand | Eris.ChatInputApplicationCommandStructure
    > => [
        {
            type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
        },
    ];

    call = async ({ message }: CommandArgs): Promise<void> => {
        await ListenCommand.startListening(MessageContext.fromMessage(message));
    };

    static startListening = async (
        messageContext: MessageContext,
        interaction?: Eris.CommandInteraction
    ): Promise<void> => {
        const guildID = messageContext.guildID;
        const guildPreference = await GuildPreference.getGuildPreference(
            messageContext.guildID
        );

        const textChannel = State.client.getChannel(
            messageContext.textChannelID
        ) as Eris.TextChannel;

        const gameOwner = new KmqMember(messageContext.author.id);
        const voiceChannel = getUserVoiceChannel(messageContext);
        if (!voiceChannel) {
            await sendErrorMessage(
                messageContext,
                {
                    title: i18n.translate(
                        messageContext.guildID,
                        "misc.failure.notInVC.title"
                    ),
                    description: i18n.translate(
                        messageContext.guildID,
                        "misc.failure.notInVC.description",
                        { command: "`/listen`" }
                    ),
                },
                interaction
            );

            logger.warn(
                `${getDebugLogHeader(
                    messageContext
                )} | User not in voice channel`
            );
            return;
        }

        if (!voicePermissionsCheck(messageContext, interaction)) {
            return;
        }

        const isPremium = await areUsersPremium(
            getCurrentVoiceMembers(voiceChannel.id).map((x) => x.id)
        );

        const listeningSession = new ListeningSession(
            guildPreference,
            textChannel.id,
            voiceChannel.id,
            guildID,
            gameOwner,
            isPremium
        );

        State.listeningSessions[guildID] = listeningSession;

        if (!isPremium) {
            for (const [commandName, command] of Object.entries(
                State.client.commands
            )) {
                if (command.isUsingPremiumOption) {
                    if (command.isUsingPremiumOption(guildPreference)) {
                        logger.info(
                            `Session started by non-premium request, clearing premium option: ${commandName}`
                        );
                        // eslint-disable-next-line no-await-in-loop
                        await command.resetPremium!(guildPreference);
                    }
                }
            }
        }

        await sendBeginListeningSessionMessage(
            textChannel.name,
            voiceChannel.name,
            messageContext,
            guildPreference,
            interaction
        );

        listeningSession.startRound(messageContext);
    };

    /**
     * @param interaction - The interaction
     * @param messageContext - The message context
     */
    async processChatInputInteraction(
        interaction: Eris.CommandInteraction,
        messageContext: MessageContext
    ): Promise<void> {
        await ListenCommand.startListening(messageContext, interaction);
    }
}
