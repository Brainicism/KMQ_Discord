import { sendOptionsMessage, getDebugLogHeader } from "../../helpers/discord_utils";
import BaseCommand, { CommandArgs } from "../base_command";
import { getGuildPreference } from "../../helpers/game_utils";
import _logger from "../../logger";
import MessageContext from "../../structures/message_context";

const logger = _logger("options");

export default class OptionsCommand implements BaseCommand {
    help = {
        name: "options",
        description: "Displays the current game options.",
        usage: ",options",
        examples: [],
        priority: 50,
    };

    async call({ message }: CommandArgs) {
        const guildPreference = await getGuildPreference(message.guildID);
        logger.info(`${getDebugLogHeader(message)} | Options retrieved`);
        await sendOptionsMessage(MessageContext.fromMessage(message), guildPreference, null);
    }
}
