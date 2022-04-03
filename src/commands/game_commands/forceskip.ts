import CommandPrechecks from "../../command_prechecks";
import { KmqImages } from "../../constants";
import {
    areUserAndBotInSameVoiceChannel,
    EMBED_SUCCESS_COLOR,
    getDebugLogHeader,
    getMention,
    sendErrorMessage,
    sendInfoMessage,
} from "../../helpers/discord_utils";
import { getGuildPreference } from "../../helpers/game_utils";
import { state } from "../../kmq_worker";
import { IPCLogger } from "../../logger";
import MessageContext from "../../structures/message_context";
import BaseCommand, { CommandArgs, Help } from "../interfaces/base_command";

const logger = new IPCLogger("forceskip");

export default class ForceSkipCommand implements BaseCommand {
    aliases = ["fskip", "fs"];

    preRunChecks = [
        { checkFn: CommandPrechecks.inGameCommandPrecheck },
        { checkFn: CommandPrechecks.competitionPrecheck },
    ];

    help = (guildID: string): Help => ({
        name: "forceskip",
        description: state.localizer.translate(
            guildID,
            "command.forceskip.help.description"
        ),
        usage: ",forceskip",
        examples: [],
        priority: 1009,
    });

    call = async ({ gameSessions, message }: CommandArgs): Promise<void> => {
        const guildPreference = await getGuildPreference(message.guildID);
        const gameSession = gameSessions[message.guildID];
        if (
            !gameSession ||
            !gameSession.round ||
            !areUserAndBotInSameVoiceChannel(message)
        ) {
            logger.warn(
                `${getDebugLogHeader(
                    message
                )} | Invalid force-skip. !gameSession: ${!gameSession}. !gameSession.round: ${
                    gameSession && !gameSession.round
                }. !areUserAndBotInSameVoiceChannel: ${!areUserAndBotInSameVoiceChannel(
                    message
                )}`
            );
            return;
        }

        if (gameSession.round.skipAchieved) {
            // song already being skipped
            return;
        }

        if (message.author.id !== gameSession.owner.id) {
            await sendErrorMessage(MessageContext.fromMessage(message), {
                title: state.localizer.translate(
                    message.guildID,
                    "command.forceskip.failure.notOwner.title"
                ),
                description: state.localizer.translate(
                    message.guildID,
                    "command.forceskip.failure.notOwner.description",
                    { mentionedUser: getMention(gameSession.owner.id) }
                ),
            });
            return;
        }

        gameSession.round.skipAchieved = true;
        sendInfoMessage(
            MessageContext.fromMessage(message),
            {
                color: EMBED_SUCCESS_COLOR,
                title: state.localizer.translate(
                    message.guildID,
                    "command.skip.success.title"
                ),
                description: state.localizer.translate(
                    message.guildID,
                    "command.forceskip.description"
                ),
                thumbnailUrl: KmqImages.NOT_IMPRESSED,
            },
            true
        );

        await gameSession.endRound(
            guildPreference,
            MessageContext.fromMessage(message),
            { correct: false }
        );

        await gameSession.startRound(
            guildPreference,
            MessageContext.fromMessage(message)
        );
        gameSession.lastActiveNow();
        logger.info(`${getDebugLogHeader(message)} | Owner force-skipped.`);
    };
}
