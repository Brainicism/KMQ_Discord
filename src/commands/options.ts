import { sendOptionsMessage } from "../helpers/discord_utils";
import BaseCommand, { CommandArgs } from "./base_command";
import { getGuildPreference } from "../helpers/game_utils";

class OptionsCommand implements BaseCommand {
    async call({ message, db }: CommandArgs) {
        let guildPreference = await getGuildPreference(db, message.guild.id);
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
