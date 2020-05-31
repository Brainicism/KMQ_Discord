import BaseCommand, { CommandArgs } from "./base_command";
import { EMBED_INFO_COLOR, bold, getDebugContext, sendMessage } from "../helpers/discord_utils";
import * as Discord from "discord.js";
import * as fs from "fs";
import * as _config from "../../config/app_config.json";
import _logger from "../logger";
const logger = _logger("news");

let config: any = _config;
class NewsCommand implements BaseCommand {
    async call({ message, guildPreference, db }: CommandArgs) {
        let latestSongDate: Date;
        try {
            const data = await db.kpopVideos("app_kpop")
                .select("publishedon")
                .orderBy("publishedon", "DESC")
                .limit(1);
            latestSongDate = new Date(data[0]["publishedon"]);
        }
        catch (e) {
            logger.error(`${getDebugContext(message)} | Error retrieving latest song date`);
            latestSongDate = null;
        }

        const news: string = (await fs.readFileSync(config.newsFile)).toString();
        const embed = new Discord.RichEmbed({
            color: EMBED_INFO_COLOR,
            author: {
                name: message.author.username,
                icon_url: message.author.avatarURL
            },
            title: bold("Updates"),
            description: news,
            footer: {
                text: `Latest Song Update: ${latestSongDate.toISOString().split('T')[0]}`
            }
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
