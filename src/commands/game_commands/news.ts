import { DataFiles, KmqImages } from "../../constants";
import { IPCLogger } from "../../logger";
import {
    getDebugLogHeader,
    sendInfoMessage,
} from "../../helpers/discord_utils";
import Eris from "eris";
import LocaleType from "../../enums/locale_type";
import LocalizationManager from "../../helpers/localization_manager";
import MessageContext from "../../structures/message_context";
import State from "../../state";
import fs from "fs";
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
        usage: "/news",
        examples: [],
        priority: 10,
    });

    call = async ({ message }: CommandArgs): Promise<void> => {
        await NewsCommand.sendNews(MessageContext.fromMessage(message));
    };

    slashCommands = (): Array<Eris.ChatInputApplicationCommandStructure> => [
        {
            name: "news",
            description: LocalizationManager.localizer.translate(
                LocaleType.EN,
                "command.news.help.description"
            ),
            type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
        },
    ];

    static sendNews = async (
        messageContext: MessageContext,
        interaction?: Eris.CommandInteraction
    ): Promise<void> => {
        let newsData: string;
        try {
            newsData = (await fs.promises.readFile(DataFiles.NEWS)).toString();
        } catch (e) {
            logger.error("News file does not exist");
            return;
        }

        await sendInfoMessage(
            messageContext,
            {
                title: LocalizationManager.localizer.translate(
                    messageContext.guildID,
                    "command.news.updates.title"
                ),
                description: newsData,
                thumbnailUrl: KmqImages.READING_BOOK,
                footerText: `${
                    State.version
                } | ${LocalizationManager.localizer.translate(
                    messageContext.guildID,
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
                                    messageContext.guildID,
                                    "misc.interaction.officialKmqServer"
                                ),
                            },
                        ],
                    },
                ],
            },
            null,
            null,
            [],
            interaction
        );

        logger.info(`${getDebugLogHeader(messageContext)} | News retrieved.`);
    };

    /**
     * @param interaction - The interaction
     * @param messageContext - The message context
     */
    async processChatInputInteraction(
        interaction: Eris.CommandInteraction,
        messageContext: MessageContext
    ): Promise<void> {
        await NewsCommand.sendNews(messageContext, interaction);
    }
}
