import type BaseCommand from "../interfaces/base_command";
import {
    sendErrorMessage,
    areUserAndBotInSameVoiceChannel,
    getDebugLogHeader,
    sendInfoMessage,
} from "../../helpers/discord_utils";
import { getGuildPreference } from "../../helpers/game_utils";
import { IPCLogger } from "../../logger";
import MessageContext from "../../structures/message_context";
import { EMBED_SUCCESS_COLOR, KmqImages } from "../../constants";
import CommandPrechecks from "../../command_prechecks";
import Session from "../../structures/session";
import type CommandArgs from "../../interfaces/command_args";
import type HelpDocumentation from "../../interfaces/help";
import LocalizationManager from "../../helpers/localization_manager";
import { getMention } from "../../helpers/utils";

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
        if (!areUserAndBotInSameVoiceChannel(message)) {
            logger.warn(
                `${getDebugLogHeader(
                    message
                )} | Invalid forceskip. User and bot are not in the same voice channel.`
            );
            return;
        }

        const guildPreference = await getGuildPreference(message.guildID);
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

        await session.endRound(
            guildPreference,
            MessageContext.fromMessage(message),
            { correct: false }
        );

        await session.startRound(
            guildPreference,
            MessageContext.fromMessage(message)
        );
        session.lastActiveNow();
        logger.info(`${getDebugLogHeader(message)} | Owner force-skipped.`);
    };
}
