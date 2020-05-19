import BaseCommand, { CommandArgs } from "./base_command";
import { getDebugContext, sendOptionsMessage } from "../helpers/discord_utils";
import { GameOptions, getSongCount } from "../helpers/game_utils";
import _logger from "../logger";
const logger = _logger("limit");
const DEFAULT_LIMIT = 500;

class LimitCommand implements BaseCommand {
    async call({ message, parsedMessage, guildPreference, db }: CommandArgs) {
        guildPreference.setLimit(parseInt(parsedMessage.components[0]), db);
        let songCount = await getSongCount(guildPreference, db);
        if (guildPreference.getLimit() > songCount) {
            guildPreference.setLimit(songCount, db);
        }
        sendOptionsMessage(message, guildPreference, db, GameOptions.LIMIT);
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
                maxValue: 10000
            }
        ]
    }

    help = {
        name: "limit",
        description: "Set a maximum number of results in the song query. This effectively sets the 'Top X number of songs' based on the selected filters.",
        usage: "!limit [limit]",
        arguments: [
            {
                name: "limit",
                description: "The higher the number, popular songs become less frequent."
            }
        ]
    }
}
export default LimitCommand;

export {
    DEFAULT_LIMIT
}

