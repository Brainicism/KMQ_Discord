import BaseCommand, { CommandArgs } from "./base_command";
import { EMBED_INFO_COLOR, sendMessage } from "../helpers/discord_utils";

class RansomCommand implements BaseCommand {
    async call({ message }: CommandArgs) {
        await sendMessage(message, {
            embed: {
                color: EMBED_INFO_COLOR,
                author: {
                    name: message.author.username,
                    icon_url: message.author.avatarURL()
                },
                title: "**GIVE ME YOUR MONEY**",
            }
        })
            .then((message) => message.delete({ timeout: 100 }));
    }
    help = {
        name: "ransom",
        description: "what?",
        usage: "!ransom",
        arguments: []
    }
}
export default RansomCommand;
