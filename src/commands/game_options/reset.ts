import BaseCommand, { CommandArgs } from "../base_command";
import _logger from "../../logger";
import { getGuildPreference } from "../../helpers/game_utils";
import { getDebugContext, sendOptionsMessage } from "../../helpers/discord_utils";

const logger = _logger("cutoff");

export default class ResetCommand implements BaseCommand {
    async call({ message }: CommandArgs) {
        const guildPreference = await getGuildPreference(message.guildID);
        guildPreference.resetToDefault();
        logger.info(`${getDebugContext(message)} | Reset to default guild preferences`);
        await sendOptionsMessage(message, guildPreference, null);
    }

    validations = {
        minArgCount: 0,
        maxArgCount: 0,
        arguments: [],
    };

    help = {
        name: "reset",
        description: "Reset to the default game options",
        usage: "!reset",
        examples: [
            {
                example: "`!reset`",
                explanation: "Resets to the default game options",
            },
        ],
    };
}
