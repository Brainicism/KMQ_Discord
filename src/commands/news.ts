import BaseCommand, { CommandArgs } from "./base_command";
import * as Discord from "discord.js";
import * as fs from "fs";
import * as _config from "../config/app_config.json";
import _logger from "../logger";
import { db } from "../databases";
import { EMBED_INFO_COLOR, bold, getDebugContext, sendMessage } from "../helpers/discord_utils";
const logger = _logger("news");

const config: any = _config;
export default class NewsCommand implements BaseCommand {
    async call({ message }: CommandArgs) {
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
        if (!fs.existsSync(config.newsFile)) {
            logger.error("News file does not exist");
            return;
        }
        const news = fs.readFileSync(config.newsFile).toString();
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
