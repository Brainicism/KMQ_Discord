import fs from "fs";
import path from "path";
import BaseCommand, { CommandArgs } from "../base_command";
import _logger from "../../logger";
import dbContext from "../../database_context";
import { EMBED_INFO_COLOR, getDebugLogHeader, getMessageContext, sendInfoMessage } from "../../helpers/discord_utils";
import { bold, friendlyFormattedDate } from "../../helpers/utils";

const logger = _logger("news");

export default class NewsCommand implements BaseCommand {
    help = {
        name: "news",
        description: "Displays the latest updates to KMQ.",
        usage: "!news",
        examples: [],
        priority: 10,
    };

    aliases = ["updates"];

    async call({ message }: CommandArgs) {
        let latestSongDate: Date;
        try {
            const data = await dbContext.kmq("available_songs")
                .select("publishedon")
                .orderBy("publishedon", "DESC")
                .limit(1);
            latestSongDate = new Date(data[0].publishedon);
        } catch (e) {
            logger.error(`${getDebugLogHeader(message)} | Error retrieving latest song date`);
            latestSongDate = null;
        }
        const newsFilePath = path.resolve(__dirname, "../../../data/news.md");
        if (!fs.existsSync(newsFilePath)) {
            logger.error("News file does not exist");
            return;
        }
        const news = fs.readFileSync(newsFilePath).toString();

        logger.info(`${getDebugLogHeader(message)} | News retrieved.`);
        await sendInfoMessage(getMessageContext(message), {
            color: EMBED_INFO_COLOR,
            author: {
                username: message.author.username,
                avatarURL: message.author.avatarURL,
            },
            title: bold("Updates"),
            description: news,
            footerText: `Latest Song Update: ${friendlyFormattedDate(latestSongDate)}`,
        });
    }
}
