import BaseCommand, { CommandArgs } from "./base_command";
import { getDebugContext, sendOptionsMessage } from "../helpers/discord_utils";
import { GameOption, getGuildPreference } from "../helpers/game_utils";
import _logger from "../logger";
const logger = _logger("guessTimeout");

export default class GuessTimeoutCommand implements BaseCommand {
    async call({ message, parsedMessage, gameSessions }: CommandArgs) {
        const guildPreference = await getGuildPreference(message.guildID);
        const gameSession = gameSessions[message.guildID];
        if (parsedMessage.components.length === 0) {
            guildPreference.resetGuessTimeout();
            if (gameSession) {
                gameSession.stopGuessTimeout();
                gameSession.guessTimeoutVal = null;
            }
            await sendOptionsMessage(message, guildPreference, GameOption.TIMER);
            logger.info(`${getDebugContext(message)} | Guess timeout disabled.`);
            return;
        }
        const time = parseInt(parsedMessage.components[0]);

        guildPreference.setGuessTimeout(time);
        if (gameSession) {
            gameSession.guessTimeoutVal = time;
            console.log("Updated timer to ", time, gameSession.guessTimeoutVal);
        }

        await sendOptionsMessage(message, guildPreference, GameOption.TIMER);
        logger.info(`${getDebugContext(message)} | Guess timeout set to ${guildPreference.getGuessTimeout()}`);
    }
    validations = {
        minArgCount: 1,
        maxArgCount: 1,
        arguments: [
            {
                name: "timer",
                type: "number" as const,
                minValue: 2,
                maxValue: 180
            }
        ]
    }
    help = {
        name: "timer",
        description: "Try your best to guess correctly before the timer runs out! Enter a time in seconds, or give no arguments to disable. If a round is in progress, the timer starts next round.",
        usage: "!timer [time]",
        examples: [
            {
                example: "`!timer 45`",
                explanation: "In 45 seconds, if no user has guessed correctly, the round ends"
            },
            {
                example: "`!timer`",
                explanation: "Disables the timer"
            }
        ]
    }
    aliases = ["time", "t"]
}
