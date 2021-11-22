import fs from "fs";
import path from "path";
import BaseCommand, { CommandArgs } from "../interfaces/base_command";
import { IPCLogger } from "../../logger";
import { getDebugLogHeader, sendInfoMessage } from "../../helpers/discord_utils";
import { KmqImages } from "../../constants";
import MessageContext from "../../structures/message_context";

const logger = new IPCLogger("news");

export default class NewsCommand implements BaseCommand {
    help = {
        name: "news",
        description: "Displays the latest updates to KMQ.",
        usage: ",news",
        examples: [],
        priority: 10,
    };

    aliases = ["updates"];

    call = async ({ message }: CommandArgs) => {
        const newsFilePath = path.resolve(__dirname, "../../../data/news.md");
        if (!fs.existsSync(newsFilePath)) {
            logger.error("News file does not exist");
            return;
        }

        const news = fs.readFileSync(newsFilePath).toString();

        await sendInfoMessage(MessageContext.fromMessage(message), {
            title: "Updates",
            description: news,
            thumbnailUrl: KmqImages.READING_BOOK,
        });

        logger.info(`${getDebugLogHeader(message)} | News retrieved.`);
    };
}
