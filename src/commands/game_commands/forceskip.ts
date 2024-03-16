import { EMBED_SUCCESS_COLOR, KmqImages } from "../../constants";
import { IPCLogger } from "../../logger";
import {
    areUserAndBotInSameVoiceChannel,
    getDebugLogHeader,
    sendErrorMessage,
    sendInfoMessage,
} from "../../helpers/discord_utils";
import { getMention } from "../../helpers/utils";
import CommandPrechecks from "../../command_prechecks";
import Eris from "eris";
import MessageContext from "../../structures/message_context";
import Session from "../../structures/session";
import i18n from "../../helpers/localization_manager";
import type { DefaultSlashCommand } from "../interfaces/base_command";
import type BaseCommand from "../interfaces/base_command";
import type CommandArgs from "../../interfaces/command_args";
import type HelpDocumentation from "../../interfaces/help";

const COMMAND_NAME = "forceskip";
const logger = new IPCLogger(COMMAND_NAME);

export default class ForceSkipCommand implements BaseCommand {
    aliases = ["fskip", "fs"];

    preRunChecks = [
        { checkFn: CommandPrechecks.inSessionCommandPrecheck },
        { checkFn: CommandPrechecks.competitionPrecheck },
        { checkFn: CommandPrechecks.notSuddenDeathPrecheck },
    ];

    help = (guildID: string): HelpDocumentation => ({
        name: COMMAND_NAME,
        description: i18n.translate(
            guildID,
            "command.forceskip.help.description",
        ),
        examples: [],
        priority: 1009,
    });

    slashCommands = (): Array<
        DefaultSlashCommand | Eris.ChatInputApplicationCommandStructure
    > => [
        {
            type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
        },
    ];

    call = async ({ message }: CommandArgs): Promise<void> => {
        await ForceSkipCommand.executeForceSkip(
            MessageContext.fromMessage(message),
        );
    };

    static async executeForceSkip(
        messageContext: MessageContext,
        interaction?: Eris.CommandInteraction,
    ): Promise<void> {
        if (
            !areUserAndBotInSameVoiceChannel(
                messageContext.author.id,
                messageContext.guildID,
            )
        ) {
            await sendErrorMessage(
                messageContext,
                {
                    title: i18n.translate(
                        messageContext.guildID,
                        "command.forceskip.skipIgnored",
                    ),
                    description: i18n.translate(
                        messageContext.guildID,
                        "misc.preCheck.differentVC",
                    ),
                },
                interaction,
            );

            logger.warn(
                `${getDebugLogHeader(
                    messageContext,
                )} | Invalid forceskip. User and bot are not in the same voice channel.`,
            );
            return;
        }

        const session = Session.getSession(messageContext.guildID);
        if (
            !session.round ||
            session.round.skipAchieved ||
            session.round.finished
        ) {
            await sendErrorMessage(
                messageContext,
                {
                    title: i18n.translate(
                        messageContext.guildID,
                        "misc.failure.round.noneInProgress.title",
                    ),
                    description: i18n.translate(
                        messageContext.guildID,
                        "misc.failure.round.noneInProgress.description",
                    ),
                    thumbnailUrl: KmqImages.NOT_IMPRESSED,
                },
                interaction,
            );
            return;
        }

        if (messageContext.author.id !== session.owner.id) {
            await sendErrorMessage(
                messageContext,
                {
                    title: i18n.translate(
                        messageContext.guildID,
                        "command.forceskip.skipIgnored",
                    ),
                    description: i18n.translate(
                        messageContext.guildID,
                        "command.forceskip.failure.notOwner.description",
                        { mentionedUser: getMention(session.owner.id) },
                    ),
                },
                interaction,
            );
            return;
        }

        session.round.skipAchieved = true;
        await sendInfoMessage(
            messageContext,
            {
                color: EMBED_SUCCESS_COLOR,
                title: i18n.translate(messageContext.guildID, "misc.skip"),
                description: i18n.translate(
                    messageContext.guildID,
                    "command.forceskip.description",
                ),
                thumbnailUrl: KmqImages.NOT_IMPRESSED,
            },
            true,
            undefined,
            [],
            interaction,
        );

        await session.endRound(false, messageContext);

        await session.startRound(messageContext);
        await session.lastActiveNow();
        logger.info(
            `${getDebugLogHeader(messageContext)} | Owner force-skipped.`,
        );
    }

    /**
     * @param interaction - The interaction
     * @param messageContext - The message context
     */
    async processChatInputInteraction(
        interaction: Eris.CommandInteraction,
        messageContext: MessageContext,
    ): Promise<void> {
        await ForceSkipCommand.executeForceSkip(messageContext, interaction);
    }
}
