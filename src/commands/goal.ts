import BaseCommand, { CommandArgs } from "./base_command";
import { getDebugContext, sendOptionsMessage } from "../helpers/discord_utils";
import { GameOption, getGuildPreference } from "../helpers/game_utils";
import _logger from "../logger";
const logger = _logger("limit");
export const DEFAULT_GOAL = 0;

export default class GoalCommand implements BaseCommand {
    async call({ message, parsedMessage }: CommandArgs) {
        const guildPreference = await getGuildPreference(message.guildID);
        guildPreference.setGoal(parseInt(parsedMessage.components[0]));
        await sendOptionsMessage(message, guildPreference, GameOption.GOAL);
        logger.info(`${getDebugContext(message)} | Goal set to ${guildPreference.getGoal()}`);
    }
    validations = {
        minArgCount: 1,
        maxArgCount: 1,
        arguments: [
            {
                name: "goal",
                type: "number" as const,
                minValue: 0,
            }
        ]
    }

    help = {
        name: "goal",
        description: "Once the player with the most points reaches the goal score, the game ends. Disable by setting goal to 0.",
        usage: "!goal [goal]",
        examples: [
            {
                example: "`!goal 30`",
                explanation: "The first player to 30 wins the game."
            }
        ]
    }
}
