import BaseCommand, { CommandArgs } from "../interfaces/base_command";
import {
    sendInfoMessage,
    sendScoreboardMessage,
    getDebugLogHeader,
} from "../../helpers/discord_utils";
import { IPCLogger } from "../../logger";
import MessageContext from "../../structures/message_context";
import { state } from "../../kmq_worker";

const logger = new IPCLogger("score");

export default class ScoreCommand implements BaseCommand {
    help = (guildID: string) => ({
            name: "score",
            description: state.localizer.translate(guildID,
                "score.help.description",
            ),
            usage: ",score",
            examples: [],
        });

    helpPriority = 50;

    aliases = ["scoreboard", "sb"];

    call = async ({
        message,
        gameSessions,
    }: CommandArgs): Promise<void> => {
        const gameSession = gameSessions[message.guildID];
        if (!gameSession) {
            await sendInfoMessage(MessageContext.fromMessage(message), {
                title: state.localizer.translate(message.guildID, "misc.failure.game.noneInProgress.title"),
                description: state.localizer.translate(message.guildID,
                    "score.failure.noneInProgress.description",
                    { play: `\`${process.env.BOT_PREFIX}play\`` }
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
