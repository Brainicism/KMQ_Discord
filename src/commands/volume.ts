import BaseCommand, { CommandArgs } from "./base_command";
import { getDebugContext, sendInfoMessage } from "../helpers/discord_utils";
import _logger from "../logger";
const logger = _logger("volume");

export default class VolumeCommand implements BaseCommand {
    async call({ message }: CommandArgs) {
        await sendInfoMessage(message, "Deprecation Warning", "This command has been discontinued. Please modify the bot's volume by right clicking it instead.");
        logger.info(`${getDebugContext(message)} | Attempted to use ,volume`);
    }
    help = {
        name: "[DEPRECRATED] volume",
        description: "Set the volume at which the bot will output your music.",
        usage: "!volume [percentage]",
        arguments: [
            {
                name: "percentage",
                description: "A valid volume value is from 1 to 100. You do not need to include the percentage symbol. The default volume is 50%."
            }
        ]
    }
}
