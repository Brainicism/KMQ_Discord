import { sendOptionsMessage, getDebugContext } from "../helpers/discord_utils";
import BaseCommand, { CommandArgs } from "./base_command";
import { getGuildPreference } from "../helpers/game_utils";
import _logger from "../logger";
const logger = _logger("options");

export default class OptionsCommand implements BaseCommand {
    async call({ message }: CommandArgs) {
        const guildPreference = await getGuildPreference(message.guildID);
        logger.info(`${getDebugContext(message)} | Options retrieved`);
        await sendOptionsMessage(message, guildPreference, null);
    }
    help = {
        name: "options",
        description: "Displays the current game options.",
        usage: "!options",
        examples: []
    }
}
