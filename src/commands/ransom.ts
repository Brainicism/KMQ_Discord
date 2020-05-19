import BaseCommand, { CommandArgs } from "./base_command";

const { EMBED_INFO_COLOR } = require("../helpers/utils");

class RansomCommand implements BaseCommand {
    call({ message }: CommandArgs) {
        message.channel.send({
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
