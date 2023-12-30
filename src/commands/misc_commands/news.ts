import { IPCLogger } from "../../logger";
import { KmqImages } from "../../constants";
import { chooseRandom, clickableSlashCommand } from "../../helpers/utils";
import {
    getDebugLogHeader,
    getInteractionValue,
    sendDeprecatedTextCommandMessage,
    sendErrorMessage,
    sendInfoMessage,
} from "../../helpers/discord_utils";
import Eris from "eris";
import LocaleType from "../../enums/locale_type";
import MessageContext from "../../structures/message_context";
import NewsRange from "../../enums/news_range";
import State from "../../state";
import dbContext from "../../database_context";
import i18n from "../../helpers/localization_manager";
import schedule from "node-schedule";
import type { DefaultSlashCommand } from "../interfaces/base_command";
import type BaseCommand from "../interfaces/base_command";
import type CommandArgs from "../../interfaces/command_args";
import type HelpDocumentation from "../../interfaces/help";
import type NewsSubscription from "../../interfaces/news_subscription";

enum Action {
    SUBSCRIBE = "subscribe",
    UNSUBSCRIBE = "unsubscribe",
    GET = "get",
}

const RANGE_OPTION = "range";

const COMMAND_NAME = "news";
const logger = new IPCLogger(COMMAND_NAME);

const scheduledJobName = (
    guildID: string,
    textChannelID: string,
    range: NewsRange,
): string => `${guildID}-${textChannelID}-${range}`;

export default class NewsCommand implements BaseCommand {
    help = (guildID: string): HelpDocumentation => ({
        name: COMMAND_NAME,
        description: i18n.translate(guildID, "command.news.help.description"),
        examples: [
            {
                example: `${clickableSlashCommand(COMMAND_NAME)} ${
                    Action.GET
                } ${RANGE_OPTION}:${NewsRange.DAY}`,
                explanation: i18n.translate(
                    guildID,
                    "command.news.help.example.get",
                ),
            },
            {
                example: `${clickableSlashCommand(COMMAND_NAME)} ${
                    Action.SUBSCRIBE
                } ${RANGE_OPTION}:${NewsRange.WEEK}`,
                explanation: i18n.translate(
                    guildID,
                    "command.news.help.example.subscribe",
                ),
            },
            {
                example: `${clickableSlashCommand(COMMAND_NAME)} ${
                    Action.UNSUBSCRIBE
                } ${RANGE_OPTION}:${NewsRange.DAY}`,
                explanation: i18n.translate(
                    guildID,
                    "command.news.help.example.unsubscribe",
                ),
            },
        ],
        priority: 500,
    });

    call = async ({ message }: CommandArgs): Promise<void> => {
        logger.warn("Text-based command not supported for news");
        await sendDeprecatedTextCommandMessage(
            MessageContext.fromMessage(message),
        );
    };

    slashCommands = (): Array<
        DefaultSlashCommand | Eris.ChatInputApplicationCommandStructure
    > => [
        {
            type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
            options: [
                {
                    name: Action.GET,
                    // Reuse the description key
                    description: i18n.translate(
                        LocaleType.EN,
                        "command.news.help.description",
                    ),
                    description_localizations: Object.values(LocaleType)
                        .filter((x) => x !== LocaleType.EN)
                        .reduce(
                            (acc, locale) => ({
                                ...acc,
                                [locale]: i18n.translate(
                                    locale,
                                    "command.news.help.description",
                                ),
                            }),
                            {},
                        ),
                    type: Eris.Constants.ApplicationCommandOptionTypes
                        .SUB_COMMAND,
                    options: [
                        {
                            name: RANGE_OPTION,
                            description: i18n.translate(
                                LocaleType.EN,
                                "command.news.help.interaction.range",
                            ),
                            description_localizations: Object.values(LocaleType)
                                .filter((x) => x !== LocaleType.EN)
                                .reduce(
                                    (acc, locale) => ({
                                        ...acc,
                                        [locale]: i18n.translate(
                                            locale,
                                            "command.news.help.interaction.range",
                                        ),
                                    }),
                                    {},
                                ),
                            type: Eris.Constants.ApplicationCommandOptionTypes
                                .STRING,
                            required: true,
                            choices: Object.values(NewsRange).map(
                                (newsRange) => ({
                                    name: newsRange,
                                    value: newsRange,
                                }),
                            ),
                        },
                    ],
                },
                {
                    name: Action.SUBSCRIBE,
                    description: i18n.translate(
                        LocaleType.EN,
                        "command.news.help.interaction.subscribe",
                    ),
                    description_localizations: Object.values(LocaleType)
                        .filter((x) => x !== LocaleType.EN)
                        .reduce(
                            (acc, locale) => ({
                                ...acc,
                                [locale]: i18n.translate(
                                    locale,
                                    "command.news.help.interaction.subscribe",
                                ),
                            }),
                            {},
                        ),
                    type: Eris.Constants.ApplicationCommandOptionTypes
                        .SUB_COMMAND,
                    options: [
                        {
                            name: RANGE_OPTION,
                            description: i18n.translate(
                                LocaleType.EN,
                                "command.news.help.interaction.range",
                            ),
                            description_localizations: Object.values(LocaleType)
                                .filter((x) => x !== LocaleType.EN)
                                .reduce(
                                    (acc, locale) => ({
                                        ...acc,
                                        [locale]: i18n.translate(
                                            locale,
                                            "command.news.help.interaction.range",
                                        ),
                                    }),
                                    {},
                                ),
                            type: Eris.Constants.ApplicationCommandOptionTypes
                                .STRING,
                            required: true,
                            choices: Object.values(NewsRange).map(
                                (newsRange) => ({
                                    name: newsRange,
                                    value: newsRange,
                                }),
                            ),
                        },
                    ],
                },
                {
                    name: Action.UNSUBSCRIBE,
                    description: i18n.translate(
                        LocaleType.EN,
                        "command.news.help.interaction.unsubscribe",
                    ),
                    description_localizations: Object.values(LocaleType)
                        .filter((x) => x !== LocaleType.EN)
                        .reduce(
                            (acc, locale) => ({
                                ...acc,
                                [locale]: i18n.translate(
                                    locale,
                                    "command.news.help.interaction.unsubscribe",
                                ),
                            }),
                            {},
                        ),
                    type: Eris.Constants.ApplicationCommandOptionTypes
                        .SUB_COMMAND,
                    options: [
                        {
                            name: RANGE_OPTION,
                            description: i18n.translate(
                                LocaleType.EN,
                                "command.news.help.interaction.range",
                            ),
                            description_localizations: Object.values(LocaleType)
                                .filter((x) => x !== LocaleType.EN)
                                .reduce(
                                    (acc, locale) => ({
                                        ...acc,
                                        [locale]: i18n.translate(
                                            locale,
                                            "command.news.help.interaction.range",
                                        ),
                                    }),
                                    {},
                                ),
                            type: Eris.Constants.ApplicationCommandOptionTypes
                                .STRING,
                            required: true,
                            choices: Object.values(NewsRange).map(
                                (newsRange) => ({
                                    name: newsRange,
                                    value: newsRange,
                                }),
                            ),
                        },
                    ],
                },
            ],
        },
    ];

    static sendNews = async (
        messageContext: MessageContext,
        range: NewsRange,
        interaction?: Eris.CommandInteraction,
    ): Promise<void> => {
        const locale = State.getGuildLocale(messageContext.guildID);

        let summary: string;
        try {
            summary = State.news[range][locale];
        } catch (err) {
            // Failed to generate news since startup
            logger.error(
                `${getDebugLogHeader(messageContext)} | Error sending news: ${
                    err.message
                }`,
            );

            await sendErrorMessage(messageContext, {
                title: i18n.translate(locale, "command.news.error.title"),
                description: i18n.translate(
                    locale,
                    "command.news.error.description",
                ),
                thumbnailUrl: KmqImages.DEAD,
            });

            return;
        }

        const thumbnail = chooseRandom([
            KmqImages.THUMBS_UP,
            KmqImages.HAPPY,
            KmqImages.READING_BOOK,
        ]);

        await sendInfoMessage(
            messageContext,
            {
                title: i18n.translate(
                    messageContext.guildID,
                    "command.news.title",
                ),
                description: summary,
                thumbnailUrl: thumbnail,
                footerText: i18n.translate(locale, "command.news.disclaimer"),
            },
            false,
            undefined,
            [],
            interaction,
        );

        logger.info(
            `${getDebugLogHeader(messageContext)} | Kpop news retrieved.`,
        );
    };

    static scheduleNewsJob = (subscription: NewsSubscription): void => {
        const subscriptionContext = new MessageContext(
            subscription.textChannelID,
            null,
            subscription.guildID,
        );

        const jobName = scheduledJobName(
            subscription.guildID,
            subscription.textChannelID,
            subscription.range,
        );

        if (subscription.range === NewsRange.DAY) {
            schedule.scheduleJob(jobName, "0 0 * * *", async () => {
                await NewsCommand.sendNews(
                    subscriptionContext,
                    subscription.range,
                );
            });
        } else if (subscription.range === NewsRange.WEEK) {
            schedule.scheduleJob(jobName, "0 0 * * 0", async () => {
                await NewsCommand.sendNews(
                    subscriptionContext,
                    subscription.range,
                );
            });
        }
    };

    static subscribeNews = async (
        messageContext: MessageContext,
        range: NewsRange,
        interaction: Eris.CommandInteraction,
    ): Promise<void> => {
        const subscription: NewsSubscription = {
            guildID: messageContext.guildID,
            textChannelID: messageContext.textChannelID,
            range,
            createdAt: new Date(),
        };

        await dbContext.kmq
            .insertInto("news_subscriptions")
            .values({
                guild_id: subscription.guildID,
                text_channel_id: subscription.textChannelID,
                range: subscription.range,
                created_at: subscription.createdAt,
            })
            .onDuplicateKeyUpdate({
                guild_id: subscription.guildID,
                text_channel_id: subscription.textChannelID,
                range: subscription.range,
                created_at: subscription.createdAt,
            })
            .execute();

        this.scheduleNewsJob(subscription);

        await sendInfoMessage(messageContext, {
            title: i18n.translate(
                messageContext.guildID,
                "command.news.subscribe.title",
            ),
            description: i18n.translate(
                messageContext.guildID,
                "command.news.subscribe.description",
            ),
        });

        await this.sendNews(messageContext, range, interaction);
    };

    static unsubscribeNews = async (
        messageContext: MessageContext,
        range: NewsRange,
        interaction: Eris.CommandInteraction,
    ): Promise<void> => {
        await sendInfoMessage(
            messageContext,
            {
                title: i18n.translate(
                    messageContext.guildID,
                    "command.news.unsubscribe.title",
                ),
                description: i18n.translate(
                    messageContext.guildID,
                    "command.news.unsubscribe.description",
                ),
            },
            false,
            undefined,
            [],
            interaction,
        );

        schedule.cancelJob(
            scheduledJobName(
                messageContext.guildID,
                messageContext.textChannelID,
                range,
            ),
        );

        await dbContext.kmq
            .deleteFrom("news_subscriptions")
            .where("guild_id", "=", messageContext.guildID)
            .where("range", "=", range)
            .execute();
    };

    /**
     * @param interaction - The interaction
     * @param messageContext - The message context
     */
    async processChatInputInteraction(
        interaction: Eris.CommandInteraction,
        messageContext: MessageContext,
    ): Promise<void> {
        const { interactionName, interactionOptions } =
            getInteractionValue(interaction);

        const range = interactionOptions[RANGE_OPTION] as NewsRange;
        if (interactionName === Action.SUBSCRIBE) {
            await NewsCommand.subscribeNews(messageContext, range, interaction);
        } else if (interactionName === Action.UNSUBSCRIBE) {
            await NewsCommand.unsubscribeNews(
                messageContext,
                range,
                interaction,
            );
        } else if (interactionName === Action.GET) {
            await NewsCommand.sendNews(messageContext, range, interaction);
        }
    }
}
