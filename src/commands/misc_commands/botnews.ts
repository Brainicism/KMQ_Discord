import { DataFiles, KmqImages } from "../../constants.js";
import { IPCLogger } from "../../logger.js";
import {
    getDebugLogHeader,
    sendInfoMessage,
} from "../../helpers/discord_utils.js";
import * as Eris from "eris";
import MessageContext from "../../structures/message_context.js";
import State from "../../state.js";
import fs from "fs";
import i18n from "../../helpers/localization_manager.js";
import type { DefaultSlashCommand } from "../interfaces/base_command.js";
import type BaseCommand from "../interfaces/base_command.js";
import type CommandArgs from "../../interfaces/command_args.js";
import type HelpDocumentation from "../../interfaces/help.js";

const COMMAND_NAME = "botnews";
const logger = new IPCLogger(COMMAND_NAME);

// eslint-disable-next-line import/no-unused-modules
export default class BotNewsCommand implements BaseCommand {
    aliases = ["updates"];

    help = (guildID: string): HelpDocumentation => ({
        name: COMMAND_NAME,
        description: i18n.translate(
            guildID,
            "command.botnews.help.description",
        ),
        examples: [],
        priority: 10,
    });

    call = async ({ message }: CommandArgs): Promise<void> => {
        await BotNewsCommand.sendNews(MessageContext.fromMessage(message));
    };

    slashCommands = (): Array<
        DefaultSlashCommand | Eris.ChatInputApplicationCommandStructure
    > => [
        {
            type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
        },
    ];

    static sendNews = async (
        messageContext: MessageContext,
        interaction?: Eris.CommandInteraction,
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
                title: i18n.translate(
                    messageContext.guildID,
                    "command.botnews.updates.title",
                ),
                description: newsData,
                thumbnailUrl: KmqImages.READING_BOOK,
                footerText: `${State.version} | ${i18n.translate(
                    messageContext.guildID,
                    "command.botnews.updates.footer",
                )}`,
                actionRows: [
                    {
                        type: Eris.Constants.ComponentTypes.ACTION_ROW,
                        components: [
                            {
                                style: 5,
                                url: "https://discord.gg/gDdVXvqVUr",
                                type: 2,
                                emoji: { name: "🎵", id: null },
                                label: i18n.translate(
                                    messageContext.guildID,
                                    "misc.interaction.officialKmqServer",
                                ),
                            },
                        ],
                    },
                ],
            },
            false,
            undefined,
            [],
            interaction,
        );

        logger.info(`${getDebugLogHeader(messageContext)} | News retrieved.`);
    };

    /**
     * @param interaction - The interaction
     * @param messageContext - The message context
     */
    async processChatInputInteraction(
        interaction: Eris.CommandInteraction,
        messageContext: MessageContext,
    ): Promise<void> {
        await BotNewsCommand.sendNews(messageContext, interaction);
    }
}
