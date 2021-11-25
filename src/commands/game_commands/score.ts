import BaseCommand, { CommandArgs } from "../interfaces/base_command";
import {
    sendInfoMessage,
    sendScoreboardMessage,
    getDebugLogHeader,
} from "../../helpers/discord_utils";
import { IPCLogger } from "../../logger";
import MessageContext from "../../structures/message_context";

const logger = new IPCLogger("score");

export default class ScoreCommand implements BaseCommand {
    help = {
        name: "score",
        description: "See the scoreboard for the current game",
        usage: ",score",
        examples: [],
        priority: 50,
    };

    aliases = ["scoreboard", "sb"];

    call = async ({ message, gameSessions }: CommandArgs): Promise<void> => {
        const gameSession = gameSessions[message.guildID];
        if (!gameSession) {
            await sendInfoMessage(MessageContext.fromMessage(message), {
                title: "No Active Game",
                description: `There is no currently active game of KMQ. Start a new game with \`${process.env.BOT_PREFIX}play\`!`,
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
