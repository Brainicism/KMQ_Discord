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
        description: state.localizer.translate(
            guildID,
            "command.news.help.description"
        ),
        examples: [],
        name: "news",
        priority: 10,
        usage: ",news",
    });

    call = async ({ message }: CommandArgs): Promise<void> => {
        const newsFilePath = path.resolve(__dirname, "../../../data/news.md");
        if (!fs.existsSync(newsFilePath)) {
            logger.error("News file does not exist");
            return;
        }

        const news = fs.readFileSync(newsFilePath).toString();

        await sendInfoMessage(MessageContext.fromMessage(message), {
            description: news,
            footerText: getKmqCurrentVersion(),
            thumbnailUrl: KmqImages.READING_BOOK,
            title: state.localizer.translate(
                message.guildID,
                "command.news.updates.title"
            ),
        });

        logger.info(`${getDebugLogHeader(message)} | News retrieved.`);
    };
}
