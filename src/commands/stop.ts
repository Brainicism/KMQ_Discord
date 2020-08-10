import BaseCommand, { CommandArgs } from "./base_command";
import { sendInfoMessage } from "../helpers/discord_utils";
import { getGuildPreference } from "../helpers/game_utils";

class StopCommand implements BaseCommand {
    async call({ message }: CommandArgs) {
        const guildPreference = await getGuildPreference(message.guild.id);
        await sendInfoMessage(message, "Command Deprecated", `This command is no longer supported. Please use \`${guildPreference.getBotPrefix()}end\` when ending a game instead.`);
    }
    help = {
        name: "stop",
        description: "[DEPRECATED] The game will be suspended and the bot will reveal the answer to any ongoing games in session.",
        usage: "!stop",
        arguments: []
    }
}
export default StopCommand;
