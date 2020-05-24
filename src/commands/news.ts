import BaseCommand, { CommandArgs } from "./base_command";
import { EMBED_INFO_COLOR, bold, sendMessage } from "../helpers/discord_utils";
import * as Discord from "discord.js";
import * as fs from "fs";
import * as _config from "../../config/app_config.json";
let config: any = _config;
class NewsCommand implements BaseCommand {
    async call({ message, guildPreference, db }: CommandArgs) {
        let news: string = (await fs.readFileSync(config.newsFile)).toString();
        let embed = new Discord.MessageEmbed({
            color: EMBED_INFO_COLOR,
            author: {
                name: message.author.username,
                icon_url: message.author.avatarURL()
            },
            title: bold("Updates"),
            description: news
        });

        await sendMessage(message, embed);
    }
    help = {
        name: "news",
        description: "Displays the latest updates to KMQ.",
        usage: "!news",
        arguments: []
    }

    aliases = ["updates"]
}
export default NewsCommand;
