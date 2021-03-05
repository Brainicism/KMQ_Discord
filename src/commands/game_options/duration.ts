import BaseCommand, { CommandArgs } from "../base_command";
import { getDebugLogHeader, sendOptionsMessage } from "../../helpers/discord_utils";
import { getGuildPreference } from "../../helpers/game_utils";
import _logger from "../../logger";
import { GameOption } from "../../types";

const logger = _logger("duration");

export default class DurationCommand implements BaseCommand {
    validations = {
        minArgCount: 0,
        maxArgCount: 1,
        arguments: [
            {
                name: "duration",
                type: "number" as const,
                minValue: 2,
                maxValue: 600,
            },
        ],
    };

    help = {
        name: "duration",
        description: "Sets a maximum length for the KMQ game in minutes.",
        usage: "!duration [minutes]",
        examples: [
            {
                example: "`!duration 15`",
                explanation: "The game will automatically end after 15 minutes.",
            },
            {
                example: "`!duration`",
                explanation: "Disables the duration",
            },
        ],
        priority: 110,
    };

    async call({ message, parsedMessage }: CommandArgs) {
        const guildPreference = await getGuildPreference(message.guildID);
        if (parsedMessage.components.length === 0) {
            guildPreference.resetDuration();
            await sendOptionsMessage(message, guildPreference, { option: GameOption.DURATION, reset: true });
            logger.info(`${getDebugLogHeader(message)} | Duration disabled.`);
            return;
        }
        const duration = parseInt(parsedMessage.components[0], 10);

        guildPreference.setDuration(duration);
        await sendOptionsMessage(message, guildPreference, { option: GameOption.DURATION, reset: false });
        logger.info(`${getDebugLogHeader(message)} | Duration set to ${guildPreference.getDuration()}`);
    }
}
