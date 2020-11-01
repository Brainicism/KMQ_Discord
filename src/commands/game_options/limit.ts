import BaseCommand, { CommandArgs } from "../base_command";
import { getDebugContext, sendOptionsMessage } from "../../helpers/discord_utils";
import { getSongCount, getGuildPreference } from "../../helpers/game_utils";
import _logger from "../../logger";
import { GameOption } from "../../types";

const logger = _logger("limit");
export const DEFAULT_LIMIT = 500;

export default class LimitCommand implements BaseCommand {
    async call({ message, parsedMessage }: CommandArgs) {
        const guildPreference = await getGuildPreference(message.guildID);
        guildPreference.setLimit(parseInt(parsedMessage.components[0], 10));
        const songCount = await getSongCount(guildPreference);
        if (guildPreference.getLimit() > songCount) {
            guildPreference.setLimit(songCount);
        }
        await sendOptionsMessage(message, guildPreference, GameOption.LIMIT);
        logger.info(`${getDebugContext(message)} | Limit set to ${guildPreference.getLimit()}`);
    }
    validations = {
        minArgCount: 1,
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
                example: "`!limit 500`",
                explanation: "Plays the top 500 most listened songs from the currently selected options.",
            },
        ],
    };
}
