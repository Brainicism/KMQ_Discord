import {
    getDebugLogHeader,
    sendInfoMessage,
    sendScoreboardMessage,
} from "../../helpers/discord_utils";
import { state } from "../../kmq_worker";
import { IPCLogger } from "../../logger";
import MessageContext from "../../structures/message_context";
import BaseCommand, { CommandArgs, Help } from "../interfaces/base_command";

const logger = new IPCLogger("score");

export default class ScoreCommand implements BaseCommand {
    aliases = ["scoreboard", "sb"];

    help = (guildID: string): Help => ({
        description: state.localizer.translate(
            guildID,
            "command.score.help.description"
        ),
        examples: [],
        name: "score",
        priority: 50,
        usage: ",score",
    });

    call = async ({ message, gameSessions }: CommandArgs): Promise<void> => {
        const gameSession = gameSessions[message.guildID];
        if (!gameSession) {
            await sendInfoMessage(MessageContext.fromMessage(message), {
                description: state.localizer.translate(
                    message.guildID,
                    "command.score.failure.noneInProgress.description",
                    { play: `\`${process.env.BOT_PREFIX}play\`` }
                ),
                title: state.localizer.translate(
                    message.guildID,
                    "misc.failure.game.noneInProgress.title"
                ),
            });

            logger.warn(
                `${getDebugLogHeader(message)} | No active game session.`
            );
            return;
        }

        await sendScoreboardMessage(message, gameSession);
        logger.info(`${getDebugLogHeader(message)} | Score retrieved`);
    };
}
