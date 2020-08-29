import BaseCommand, { CommandArgs } from "./base_command";
import { getDebugContext, sendOptionsMessage } from "../helpers/discord_utils";
import { GameOption, getGuildPreference } from "../helpers/game_utils";
import _logger from "../logger";
const logger = _logger("limit");

export default class GoalCommand implements BaseCommand {
    async call({ message, parsedMessage }: CommandArgs) {
        const guildPreference = await getGuildPreference(message.guildID);
        if (parsedMessage.components.length === 0) {
            guildPreference.resetGoal();
            await sendOptionsMessage(message, guildPreference, GameOption.GOAL);
            logger.info(`${getDebugContext(message)} | Goal disabled.`);
            return;
        }
        guildPreference.setGoal(parseInt(parsedMessage.components[0]));
        await sendOptionsMessage(message, guildPreference, GameOption.GOAL);
        logger.info(`${getDebugContext(message)} | Goal set to ${guildPreference.getGoal()}`);
    }
    validations = {
        minArgCount: 0,
        maxArgCount: 1,
        arguments: [
            {
                name: "goal",
                type: "number" as const,
                minValue: 1,
            }
        ]
    }

    help = {
        name: "goal",
        description: "Once the player with the most points reaches the goal score, the game ends. Calling it with no arguments disables the goal.",
        usage: "!goal [goal]",
        examples: [
            {
                example: "`!goal 30`",
                explanation: "The first player to 30 wins the game."
            },
            {
                example: "`!goal`",
                explanation: "Disables the goal."
            }
        ]
    }
}
