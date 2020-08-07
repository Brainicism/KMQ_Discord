import BaseCommand, { CommandArgs } from "./base_command";
import { sendInfoMessage } from "../helpers/discord_utils";

class StopCommand implements BaseCommand {
    async call({ message }: CommandArgs) {
        await sendInfoMessage(message, "Command Deprecated", "This command is no longer supported. Please use `,end` when ending a game instead.");
    }
    help = {
        name: "stop",
        description: "[DEPRECATED] The game will be suspended and the bot will reveal the answer to any ongoing games in session.",
        usage: "!stop",
        arguments: []
    }
}
export default StopCommand;
