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
            }
            await sendOptionsMessage(message, guildPreference, GameOption.TIMER);
            logger.info(`${getDebugContext(message)} | Guess timeout disabled.`);
            return;
        }
        const time = parseInt(parsedMessage.components[0]);

        guildPreference.setGuessTimeout(time);
        if (gameSession && gameSession.sessionInitialized && gameSession.connection.playing) {
            // Timer can start mid-song, starting when the user enters the command
            gameSession.stopGuessTimeout();
            gameSession.startGuessTimeout(message);
        }
        await sendOptionsMessage(message, guildPreference, GameOption.TIMER);
        logger.info(`${getDebugContext(message)} | Guess timeout set to ${guildPreference.getGuessTimeout()}`);
    }
    validations = {
        minArgCount: 0,
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
        description: "Try your best to guess correctly before the timer runs out! Enter a time in seconds, or give no arguments to disable.",
        usage: "!timer [time]",
        examples: [
            {
                example: "`!timer 15`",
                explanation: "In 15 seconds, if no user has guessed correctly, the round ends and the next one begins automatically"
            },
            {
                example: "`!timer`",
                explanation: "Disables the timer"
            }
        ]
    }
    aliases = ["time", "timeout", "t"]
}
