import { sendOptionsMessage } from "../helpers/utils";
import BaseCommand, { CommandArgs } from "./base_command";

class OptionsCommand implements BaseCommand {
    call({ message, guildPreference, db }: CommandArgs) {
        sendOptionsMessage(message, guildPreference, db, null);
    }
    help = {
        name: "options",
        description: "Displays the current game options.",
        usage: "!options",
        arguments: []
    }

}
export default OptionsCommand;
