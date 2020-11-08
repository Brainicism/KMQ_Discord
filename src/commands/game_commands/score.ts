import BaseCommand, { CommandArgs } from "../base_command";
import { sendInfoMessage, sendScoreboardMessage, getDebugContext } from "../../helpers/discord_utils";
import _logger from "../../logger";

const logger = _logger("score");

export default class ScoreCommand implements BaseCommand {
    async call({ message, gameSessions }: CommandArgs) {
        const gameSession = gameSessions[message.guildID];
        if (!gameSession) {
            sendInfoMessage(message, "No Active Game", `There is no currently active game of KMQ. Start a new game with \`${process.env.PREFIX}play\``);
            logger.warn(`${getDebugContext(message)} | No active game session.`);
            return;
        }
        logger.info(`${getDebugContext(message)} | Score retrieved`);
        await sendScoreboardMessage(message, gameSession);
    }
    help = {
        name: "score",
        description: "See the scoreboard for the current game",
        usage: "!score",
        examples: [],
    };
    aliases = ["scoreboard"];
}
