import { sendOptionsMessage } from "../helpers/discord_utils";
import BaseCommand, { CommandArgs } from "./base_command";

class OptionsCommand implements BaseCommand {
    async call({ message, guildPreference, db }: CommandArgs) {
        await sendOptionsMessage(message, guildPreference, db, null);
    }
    help = {
        name: "options",
        description: "Displays the current game options.",
        usage: "!options",
        arguments: []
    }
}
export default OptionsCommand;
