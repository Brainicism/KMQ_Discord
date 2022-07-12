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
        usage: ",forceskip",
        examples: [],
        priority: 1009,
    });

    call = async ({ message }: CommandArgs): Promise<void> => {
        if (
            !areUserAndBotInSameVoiceChannel(message.author.id, message.guildID)
        ) {
            logger.warn(
                `${getDebugLogHeader(
                    message
                )} | Invalid forceskip. User and bot are not in the same voice channel.`
            );
            return;
        }

        const session = Session.getSession(message.guildID);
        if (
            !session.round ||
            session.round.skipAchieved ||
            session.round.finished
        ) {
            return;
        }

        if (message.author.id !== session.owner.id) {
            await sendErrorMessage(MessageContext.fromMessage(message), {
                title: LocalizationManager.localizer.translate(
                    message.guildID,
                    "command.forceskip.failure.notOwner.title"
                ),
                description: LocalizationManager.localizer.translate(
                    message.guildID,
                    "command.forceskip.failure.notOwner.description",
                    { mentionedUser: getMention(session.owner.id) }
                ),
            });
            return;
        }

        session.round.skipAchieved = true;
        sendInfoMessage(
            MessageContext.fromMessage(message),
            {
                color: EMBED_SUCCESS_COLOR,
                title: LocalizationManager.localizer.translate(
                    message.guildID,
                    "misc.skip"
                ),
                description: LocalizationManager.localizer.translate(
                    message.guildID,
                    "command.forceskip.description"
                ),
                thumbnailUrl: KmqImages.NOT_IMPRESSED,
            },
            true
        );

        await session.endRound(MessageContext.fromMessage(message), {
            correct: false,
        });

        await session.startRound(MessageContext.fromMessage(message));
        session.lastActiveNow();
        logger.info(`${getDebugLogHeader(message)} | Owner force-skipped.`);
    };
}
