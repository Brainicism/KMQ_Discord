import BaseCommand, { CommandArgs } from "../base_command";
import { getDebugLogHeader, sendErrorMessage, sendOptionsMessage, getMessageContext } from "../../helpers/discord_utils";
import { getSongCount, getGuildPreference } from "../../helpers/game_utils";
import _logger from "../../logger";
import { GameOption } from "../../types";

const logger = _logger("limit");
export const DEFAULT_LIMIT = 500;

export default class LimitCommand implements BaseCommand {
    validations = {
        minArgCount: 0,
        maxArgCount: 1,
        arguments: [
            {
                name: "limit",
                type: "number" as const,
                minValue: 1,
                maxValue: 10000,
            },
        ],
    };

    help = {
        name: "limit",
        description: "Set a maximum number of results in the song query. This effectively sets the 'Top X number of songs' based on the selected filters.",
        usage: "!limit [limit]",
        examples: [
            {
                example: "`!limit 250`",
                explanation: "Plays the top 250 most listened songs from the currently selected options.",
            },
            {
                example: "`!limit`",
                explanation: `Reset to the default limit of \`${DEFAULT_LIMIT}\``,
            },
        ],
        priority: 140,
    };

    async call({ message, parsedMessage }: CommandArgs) {
        const guildPreference = await getGuildPreference(message.guildID);
        if (parsedMessage.components.length === 0) {
            guildPreference.resetLimit();
            logger.info(`${getDebugLogHeader(message)} | Limit reset.`);
            await sendOptionsMessage(message, guildPreference, { option: GameOption.LIMIT, reset: true });
            return;
        }

        const newLimit = parseInt(parsedMessage.components[0], 10);
        guildPreference.setLimit(newLimit);
        const songCount = await getSongCount(guildPreference);
        if (songCount === 0) {
            sendErrorMessage(getMessageContext(message), "Game Option Error", "Cannot set a limit when there are 0 total songs. Please change your game options.");
            return;
        }
        if (guildPreference.getLimit() > songCount) {
            guildPreference.setLimit(songCount);
        }
        await sendOptionsMessage(message, guildPreference, { option: GameOption.LIMIT, reset: false });
        logger.info(`${getDebugLogHeader(message)} | Limit set to ${guildPreference.getLimit()}`);
    }
}
