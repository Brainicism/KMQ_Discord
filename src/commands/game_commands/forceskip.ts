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
import LocaleType from "../../enums/locale_type";
import LocalizationManager from "../../helpers/localization_manager";
import MessageContext from "../../structures/message_context";
import Session from "../../structures/session";
import type BaseCommand from "../interfaces/base_command";
import type CommandArgs from "../../interfaces/command_args";
import type HelpDocumentation from "../../interfaces/help";

const logger = new IPCLogger("forceskip");

export default class ForceSkipCommand implements BaseCommand {
    aliases = ["fskip", "fs"];

    preRunChecks = [
        { checkFn: CommandPrechecks.inSessionCommandPrecheck },
        { checkFn: CommandPrechecks.competitionPrecheck },
    ];

    help = (guildID: string): HelpDocumentation => ({
        name: "forceskip",
        description: LocalizationManager.localizer.translate(
            guildID,
            "command.forceskip.help.description"
        ),
        usage: "/forceskip",
        examples: [],
        priority: 1009,
    });

    slashCommands = (): Array<Eris.ChatInputApplicationCommandStructure> => [
        {
            name: "forceskip",
            description: LocalizationManager.localizer.translate(
                LocaleType.EN,
                "command.forceskip.help.description"
            ),
            type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
        },
    ];

    call = async ({ message }: CommandArgs): Promise<void> => {
        await ForceSkipCommand.executeForceSkip(
            MessageContext.fromMessage(message)
        );
    };

    static async executeForceSkip(
        messageContext: MessageContext,
        interaction?: Eris.CommandInteraction
    ): Promise<void> {
        if (
            !areUserAndBotInSameVoiceChannel(
                messageContext.author.id,
                messageContext.guildID
            )
        ) {
            await sendErrorMessage(
                messageContext,
                {
                    title: LocalizationManager.localizer.translate(
                        messageContext.guildID,
                        "command.forceskip.skipIgnored"
                    ),
                    description: LocalizationManager.localizer.translate(
                        messageContext.guildID,
                        "misc.preCheck.differentVC"
                    ),
                },
                interaction
            );

            logger.warn(
                `${getDebugLogHeader(
                    messageContext
                )} | Invalid forceskip. User and bot are not in the same voice channel.`
            );
            return;
        }

        const session = Session.getSession(messageContext.guildID);
        if (
            !session.round ||
            session.round.skipAchieved ||
            session.round.finished
        ) {
            sendErrorMessage(
                messageContext,
                {
                    title: LocalizationManager.localizer.translate(
                        messageContext.guildID,
                        "misc.failure.round.noneInProgress.title"
                    ),
                    description: LocalizationManager.localizer.translate(
                        messageContext.guildID,
                        "misc.failure.round.noneInProgress.description"
                    ),
                    thumbnailUrl: KmqImages.NOT_IMPRESSED,
                },
                interaction
            );
            return;
        }

        if (messageContext.author.id !== session.owner.id) {
            await sendErrorMessage(
                messageContext,
                {
                    title: LocalizationManager.localizer.translate(
                        messageContext.guildID,
                        "command.forceskip.skipIgnored"
                    ),
                    description: LocalizationManager.localizer.translate(
                        messageContext.guildID,
                        "command.forceskip.failure.notOwner.description",
                        { mentionedUser: getMention(session.owner.id) }
                    ),
                },
                interaction
            );
            return;
        }

        session.round.skipAchieved = true;
        sendInfoMessage(
            messageContext,
            {
                color: EMBED_SUCCESS_COLOR,
                title: LocalizationManager.localizer.translate(
                    messageContext.guildID,
                    "misc.skip"
                ),
                description: LocalizationManager.localizer.translate(
                    messageContext.guildID,
                    "command.forceskip.description"
                ),
                thumbnailUrl: KmqImages.NOT_IMPRESSED,
            },
            true,
            null,
            [],
            interaction
        );

        await session.endRound(messageContext, {
            correct: false,
        });

        await session.startRound(messageContext);
        session.lastActiveNow();
        logger.info(
            `${getDebugLogHeader(messageContext)} | Owner force-skipped.`
        );
    }

    /**
     * @param interaction - The interaction
     * @param messageContext - The message context
     */
    async processChatInputInteraction(
        interaction: Eris.CommandInteraction,
        messageContext: MessageContext
    ): Promise<void> {
        await ForceSkipCommand.executeForceSkip(messageContext, interaction);
    }
}
