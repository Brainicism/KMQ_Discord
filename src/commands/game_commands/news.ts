import fs from "fs";
import path from "path";

import { KmqImages } from "../../constants";
import {
    getDebugLogHeader,
    sendInfoMessage,
} from "../../helpers/discord_utils";
import { getKmqCurrentVersion } from "../../helpers/game_utils";
import { state } from "../../kmq_worker";
import { IPCLogger } from "../../logger";
import MessageContext from "../../structures/message_context";
import BaseCommand, { CommandArgs, Help } from "../interfaces/base_command";

const logger = new IPCLogger("news");

export default class NewsCommand implements BaseCommand {
    aliases = ["updates"];

    help = (guildID: string): Help => ({
        name: "news",
        description: state.localizer.translate(
            guildID,
            "command.news.help.description"
        ),
        usage: ",news",
        examples: [],
        priority: 10,
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
                "command.news.updates.title"
            ),
            description: news,
            thumbnailUrl: KmqImages.READING_BOOK,
            footerText: getKmqCurrentVersion(),
        });

        logger.info(`${getDebugLogHeader(message)} | News retrieved.`);
    };
}
