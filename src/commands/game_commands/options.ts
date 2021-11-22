import { sendOptionsMessage, getDebugLogHeader } from "../../helpers/discord_utils";
import BaseCommand, { CommandArgs } from "../interfaces/base_command";
import { getGuildPreference } from "../../helpers/game_utils";
import { IPCLogger } from "../../logger";
import MessageContext from "../../structures/message_context";

const logger = new IPCLogger("options");

export default class OptionsCommand implements BaseCommand {
    help = {
        name: "options",
        description: "Displays the current game options.",
        usage: ",options",
        examples: [],
        priority: 50,
    };

    call = async ({ message }: CommandArgs) => {
        const guildPreference = await getGuildPreference(message.guildID);
        await sendOptionsMessage(MessageContext.fromMessage(message), guildPreference, null);
        logger.info(`${getDebugLogHeader(message)} | Options retrieved`);
    };
}
