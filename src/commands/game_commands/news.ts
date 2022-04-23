import fs from "fs";
import path from "path";
import BaseCommand from "../interfaces/base_command";
import { IPCLogger } from "../../logger";
import {
    getDebugLogHeader,
    sendInfoMessage,
} from "../../helpers/discord_utils";
import { KmqImages } from "../../constants";
import MessageContext from "../../structures/message_context";
import State from "../../state";
import { getKmqCurrentVersion } from "../../helpers/game_utils";
import CommandArgs from "../../interfaces/command_args";
import HelpDocumentation from "../../interfaces/help";

const logger = new IPCLogger("news");

export default class NewsCommand implements BaseCommand {
    aliases = ["updates"];

    help = (guildID: string): HelpDocumentation => ({
        name: "news",
        description: State.localizer.translate(
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
            title: State.localizer.translate(
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
