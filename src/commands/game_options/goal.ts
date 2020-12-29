import BaseCommand, { CommandArgs } from "../base_command";
import { getDebugContext, sendOptionsMessage, sendErrorMessage } from "../../helpers/discord_utils";
import { getGuildPreference } from "../../helpers/game_utils";
import _logger from "../../logger";
import { GameOption } from "../../types";

const logger = _logger("goal");

export default class GoalCommand implements BaseCommand {
    validations = {
        minArgCount: 0,
        maxArgCount: 1,
        arguments: [
            {
                name: "goal",
                type: "number" as const,
                minValue: 1,
            },
        ],
    };

    help = {
        name: "goal",
        description: "Once the player with the most points reaches the goal score, the game ends. Calling it with no arguments disables the goal. If a game is in progress, the goal must exceed the highest score",
        usage: "!goal [goal]",
        examples: [
            {
                example: "`!goal 30`",
                explanation: "The first player to 30 wins the game",
            },
            {
                example: "`!goal`",
                explanation: "Disables the goal",
            },
        ],
        priority: 120,
    };

    async call({ message, parsedMessage, gameSessions }: CommandArgs) {
        const guildPreference = await getGuildPreference(message.guildID);
        if (parsedMessage.components.length === 0) {
            guildPreference.resetGoal();
            await sendOptionsMessage(message, guildPreference, GameOption.GOAL);
            logger.info(`${getDebugContext(message)} | Goal disabled.`);
            return;
        }

        const gameSession = gameSessions[message.guildID];
        const userGoal = parseInt(parsedMessage.components[0], 10);
        if (gameSession && !gameSession.scoreboard.isEmpty() && userGoal <= gameSession.scoreboard.getWinners()[0].getScore()) {
            logger.info(`${getDebugContext(message)} | Goal update ignored.`);
            sendErrorMessage(message, "Error applying goal", "Given goal exceeds highest score. Please raise your goal, or start a new game.");
            return;
        }

        guildPreference.setGoal(userGoal);
        await sendOptionsMessage(message, guildPreference, GameOption.GOAL);
        logger.info(`${getDebugContext(message)} | Goal set to ${guildPreference.getGoal()}`);
    }
}
