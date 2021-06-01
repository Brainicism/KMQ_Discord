import BaseCommand, { CommandArgs } from "../base_command";
import { sendInfoMessage, sendScoreboardMessage, getDebugLogHeader } from "../../helpers/discord_utils";
import _logger from "../../logger";
import MessageContext from "../../structures/message_context";

const logger = _logger("score");

export default class ScoreCommand implements BaseCommand {
    help = {
        name: "score",
        description: "See the scoreboard for the current game",
        usage: ",score",
        examples: [],
        priority: 50,
    };

    aliases = ["scoreboard"];

    async call({ message, gameSessions }: CommandArgs) {
        const gameSession = gameSessions[message.guildID];
        if (!gameSession) {
            sendInfoMessage(MessageContext.fromMessage(message), { title: "No Active Game", description: `There is no currently active game of KMQ. Start a new game with \`${process.env.BOT_PREFIX}play\`!` });
            logger.warn(`${getDebugLogHeader(message)} | No active game session.`);
            return;
        }
        logger.info(`${getDebugLogHeader(message)} | Score retrieved`);
        await sendScoreboardMessage(message, gameSession);
    }
}
