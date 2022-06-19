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

        let newsData: string;
        try {
            newsData = (await fs.promises.readFile(newsFilePath)).toString();
        } catch (e) {
            logger.error("News file does not exist");
            return;
        }

        await sendInfoMessage(MessageContext.fromMessage(message), {
            title: LocalizationManager.localizer.translate(
                message.guildID,
                "command.news.updates.title"
            ),
            description: newsData,
            thumbnailUrl: KmqImages.READING_BOOK,
            footerText: `${await getKmqCurrentVersion()} | ${LocalizationManager.localizer.translate(
                message.guildID,
                "command.news.updates.footer"
            )}`,
            components: [
                {
                    type: 1,
                    components: [
                        {
                            style: 5,
                            url: "https://discord.gg/gDdVXvqVUr",
                            type: 2,
                            emoji: { name: "🎵" },
                            label: LocalizationManager.localizer.translate(
                                message.guildID,
                                "misc.interaction.officialKmqServer"
                            ),
                        },
                    ],
                },
            ],
        });

        logger.info(`${getDebugLogHeader(message)} | News retrieved.`);
    };
}
