import BaseCommand, { CommandArgs } from "./base_command";
import { sendErrorMessage } from "../helpers/discord_utils";
import _logger from "../logger";
import { DEFAULT_BOT_PREFIX } from "../models/guild_preference";

export default class PrefixCommand implements BaseCommand {
    async call({ message }: CommandArgs) {
        await sendErrorMessage(message, "DEPRECATED", `This command has been discontinued, please use the default prefix \`${DEFAULT_BOT_PREFIX}\``);
    }
    help = {
        name: "prefix",
        description: `[DEPRECATED] Set the character used to summon the bot. You can only use a single character as the bot prefix. The default prefix is \`${DEFAULT_BOT_PREFIX}\`.`,
        usage: "!prefix [character]",
        examples: [
            {
                example: "`!prefix ;`",
                explanation: "Changes the bot's prefix to `;`"
            }
        ]
    }
}
