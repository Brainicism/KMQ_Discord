import fs from "fs";
import path from "path";
import BaseCommand, { CommandArgs, Help } from "../interfaces/base_command";
import { IPCLogger } from "../../logger";
import {
    getDebugLogHeader,
    sendInfoMessage,
} from "../../helpers/discord_utils";
import { KmqImages } from "../../constants";
import MessageContext from "../../structures/message_context";
import { state } from "../../kmq_worker";
import { getKmqCurrentVersion } from "../../helpers/game_utils";

const logger = new IPCLogger("news");

export default class NewsCommand implements BaseCommand {
    aliases = ["updates"];

    helpPriority = 10;

    help = (guildID: string): Help => ({
        name: "news",
        description: state.localizer.translate(
            guildID,
            "news.help.description"
        ),
        usage: ",news",
        examples: [],
    });

    call = async ({ message }: CommandArgs): Promise<void> => {
        const newsFilePath = path.resolve(__dirname, "../../../data/news.md");
        if (!fs.existsSync(newsFilePath)) {
            logger.error("News file does not exist");
            return;
        }

        const news = fs.readFileSync(newsFilePath).toString();

        await sendInfoMessage(MessageContext.fromMessage(message), {
            title: state.localizer.translate(
                message.guildID,
                "news.updates.title"
            ),
            description: news,
            thumbnailUrl: KmqImages.READING_BOOK,
            footerText: getKmqCurrentVersion(),
        });

        logger.info(`${getDebugLogHeader(message)} | News retrieved.`);
    };
}
