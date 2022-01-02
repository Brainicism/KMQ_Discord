import BaseCommand, { CommandArgs, Help } from "../interfaces/base_command";
import {
    sendErrorMessage,
    areUserAndBotInSameVoiceChannel,
    getDebugLogHeader,
    EMBED_SUCCESS_COLOR,
    sendInfoMessage,
    getMention,
} from "../../helpers/discord_utils";
import { getGuildPreference } from "../../helpers/game_utils";
import { IPCLogger } from "../../logger";
import MessageContext from "../../structures/message_context";
import { KmqImages } from "../../constants";
import CommandPrechecks from "../../command_prechecks";
import { state } from "../../kmq_worker";

const logger = new IPCLogger("forceskip");

export default class ForceSkipCommand implements BaseCommand {
    preRunChecks = [
        { checkFn: CommandPrechecks.inGameCommandPrecheck },
        { checkFn: CommandPrechecks.competitionPrecheck },
    ];

    help = (guildID: string): Help => ({
            name: "forceskip",
            description: state.localizer.translate(guildID,
                "forceskip.help.description",
            ),
            usage: ",forceskip",
            examples: [],
        });

    helpPriority = 1009;

    aliases = ["fskip", "fs"];

    call = async ({
        gameSessions,
        message,
    }: CommandArgs): Promise<void> => {
        const guildPreference = await getGuildPreference(message.guildID);
        const gameSession = gameSessions[message.guildID];
        if (
            !gameSession ||
            !gameSession.gameRound ||
            !areUserAndBotInSameVoiceChannel(message)
        ) {
            logger.warn(
                `${getDebugLogHeader(
                    message
                )} | Invalid force-skip. !gameSession: ${!gameSession}. !gameSession.gameRound: ${
                    gameSession && !gameSession.gameRound
                }. !areUserAndBotInSameVoiceChannel: ${!areUserAndBotInSameVoiceChannel(
                    message
                )}`
            );
            return;
        }

        if (gameSession.gameRound.skipAchieved || !gameSession.gameRound) {
            // song already being skipped
            return;
        }

        if (message.author.id !== gameSession.owner.id) {
            await sendErrorMessage(MessageContext.fromMessage(message), {
                title: state.localizer.translate(message.guildID, "forceskip.failure.notOwner.title"),
                description: state.localizer.translate(message.guildID,
                    "forceskip.failure.notOwner.description",
                    { mentionedUser: getMention(gameSession.owner.id) }
                ),
            });
            return;
        }

        gameSession.gameRound.skipAchieved = true;
        sendInfoMessage(
            MessageContext.fromMessage(message),
            {
                color: EMBED_SUCCESS_COLOR,
                title: state.localizer.translate(message.guildID, "skip.title"),
                description: state.localizer.translate(message.guildID,
                    "forceskip.description"
                ),
                thumbnailUrl: KmqImages.NOT_IMPRESSED,
            },
            true
        );

        await gameSession.endRound(
            { correct: false },
            guildPreference,
            MessageContext.fromMessage(message)
        );

        await gameSession.startRound(
            guildPreference,
            MessageContext.fromMessage(message)
        );
        gameSession.lastActiveNow();
        logger.info(`${getDebugLogHeader(message)} | Owner force-skipped.`);
    };
}
