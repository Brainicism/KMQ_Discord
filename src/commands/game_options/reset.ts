import BaseCommand, { CommandArgs } from "../interfaces/base_command";
import _logger from "../../logger";
import { getGuildPreference } from "../../helpers/game_utils";
import { getDebugLogHeader, sendOptionsMessage } from "../../helpers/discord_utils";
import MessageContext from "../../structures/message_context";

const logger = _logger("reset");

export default class ResetCommand implements BaseCommand {
    validations = {
        minArgCount: 0,
        maxArgCount: 0,
        arguments: [],
    };

    help = {
        name: "reset",
        description: "Reset to the default game options",
        usage: ",reset",
        examples: [
            {
                example: "`,reset`",
                explanation: "Resets to the default game options",
            },
        ],
        priority: 130,
    };
    call = async ({ message }: CommandArgs) => {
        const guildPreference = await getGuildPreference(message.guildID);
        await guildPreference.resetToDefault();
        logger.info(`${getDebugLogHeader(message)} | Reset to default guild preferences`);
        await sendOptionsMessage(MessageContext.fromMessage(message), guildPreference, null);
    };
}
