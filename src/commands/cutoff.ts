import BaseCommand, { CommandArgs } from "./base_command";
import { sendOptionsMessage, getDebugContext } from "../helpers/discord_utils";
import { GameOptions } from "../helpers/game_utils";
import _logger from "../logger";
const logger = _logger("cutoff");
const BEGINNING_SEARCH_YEAR = 2008;

class CutoffCommand implements BaseCommand {
    call({ message, parsedMessage, guildPreference, db }: CommandArgs) {
        guildPreference.setBeginningCutoffYear(parseInt(parsedMessage.components[0]), db);
        sendOptionsMessage(message, guildPreference, db, GameOptions.CUTOFF);
        logger.info(`${getDebugContext(message)} | Cutoff set to ${guildPreference.getBeginningCutoffYear()}`);
    }
    validations = {
        minArgCount: 1,
        maxArgCount: 1,
        arguments: [
            {
                name: "cutoff",
                type: "number" as const,
                minValue: BEGINNING_SEARCH_YEAR,
                maxValue: (new Date()).getFullYear()
            }
        ]
    }

    help = {
        name: "cutoff",
        description: "Set a cutoff year for songs. Only songs released during and after the cutoff year will be chosen.",
        usage: "!cutoff [year]",
        arguments: [
            {
                name: "year",
                description: "Songs typically range from 2008 to 2018."
            }
        ]
    }
}

export default CutoffCommand;
export {
    BEGINNING_SEARCH_YEAR
}
