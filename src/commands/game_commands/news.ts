import { IPCLogger } from "../../logger";
import { KmqImages } from "../../constants";
import {
    getDebugLogHeader,
    sendInfoMessage,
} from "../../helpers/discord_utils";
import { getKmqCurrentVersion } from "../../helpers/game_utils";
import LocalizationManager from "../../helpers/localization_manager";
import MessageContext from "../../structures/message_context";
import fs from "fs";
import path from "path";
import type BaseCommand from "../interfaces/base_command";
import type CommandArgs from "../../interfaces/command_args";
import type HelpDocumentation from "../../interfaces/help";

const logger = new IPCLogger("news");

export default class NewsCommand implements BaseCommand {
    aliases = ["updates"];

    help = (guildID: string): HelpDocumentation => ({
        name: "news",
        description: LocalizationManager.localizer.translate(
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
            title: LocalizationManager.localizer.translate(
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
