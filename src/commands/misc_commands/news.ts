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
import type { DefaultSlashCommand } from "../interfaces/base_command";
import type BaseCommand from "../interfaces/base_command";
import type CommandArgs from "../../interfaces/command_args";
import type HelpDocumentation from "../../interfaces/help";
import type NewsSubscription from "../../interfaces/news_subscription";

enum Action {
    SUBSCRIBE = "subscribe",
    UNSUBSCRIBE = "unsubscribe",
    DAILY = "daily",
    WEEKLY = "weekly",
    MONTHLY = "monthly",
}

const RANGE_OPTION = "range";

const COMMAND_NAME = "news";
const logger = new IPCLogger(COMMAND_NAME);

export default class NewsCommand implements BaseCommand {
    help = (guildID: string): HelpDocumentation => ({
        name: COMMAND_NAME,
        description: i18n.translate(guildID, "command.news.help.description"),
        examples: [
            {
                example: `${clickableSlashCommand(COMMAND_NAME)} ${
                    Action.DAILY
                }`,
                explanation: i18n.translate(
                    guildID,
                    "command.news.help.example.get",
                ),
            },
            {
                example: `${clickableSlashCommand(COMMAND_NAME)} ${
                    Action.SUBSCRIBE
                } ${RANGE_OPTION}:${NewsRange.WEEKLY}`,
                explanation: i18n.translate(
                    guildID,
                    "command.news.help.example.subscribe",
                ),
            },
            {
                example: `${clickableSlashCommand(COMMAND_NAME)} ${
                    Action.UNSUBSCRIBE
                } ${RANGE_OPTION}:${NewsRange.DAILY}`,
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
                    name: Action.DAILY,
                    description: i18n.translate(
                        LocaleType.EN,
                        "command.news.help.interaction.daily",
                    ),
                    description_localizations: Object.values(LocaleType)
                        .filter((x) => x !== LocaleType.EN)
                        .reduce(
                            (acc, locale) => ({
                                ...acc,
                                [locale]: i18n.translate(
                                    locale,
                                    "command.news.help.interaction.daily",
                                ),
                            }),
                            {},
                        ),
                    type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
                },
                {
                    name: Action.WEEKLY,
                    description: i18n.translate(
                        LocaleType.EN,
                        "command.news.help.interaction.weekly",
                    ),
                    description_localizations: Object.values(LocaleType)
                        .filter((x) => x !== LocaleType.EN)
                        .reduce(
                            (acc, locale) => ({
                                ...acc,
                                [locale]: i18n.translate(
                                    locale,
                                    "command.news.help.interaction.weekly",
                                ),
                            }),
                            {},
                        ),
                    type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
                },
                {
                    name: Action.MONTHLY,
                    description: i18n.translate(
                        LocaleType.EN,
                        "command.news.help.interaction.monthly",
                    ),
                    description_localizations: Object.values(LocaleType)
                        .filter((x) => x !== LocaleType.EN)
                        .reduce(
                            (acc, locale) => ({
                                ...acc,
                                [locale]: i18n.translate(
                                    locale,
                                    "command.news.help.interaction.monthly",
                                ),
                            }),
                            {},
                        ),
                    type: Eris.Constants.ApplicationCommandTypes.CHAT_INPUT,
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
        scheduled: boolean,
        interaction?: Eris.CommandInteraction,
    ): Promise<void> => {
        const locale = State.getGuildLocale(messageContext.guildID);
        const summary = State.news[range][locale];
        if (!summary) {
            // Failed to generate news since startup
            logger.error(
                `${getDebugLogHeader(
                    messageContext,
                )} | Error sending news due to missing entry. range = ${range}. locale = ${locale}`,
            );

            if (!scheduled) {
                // Don't send an error message for subscriptions
                await sendErrorMessage(
                    messageContext,
                    {
                        title: i18n.translate(
                            locale,
                            "command.news.error.title",
                        ),
                        description: i18n.translate(
                            locale,
                            "command.news.error.description",
                        ),
                        thumbnailUrl: KmqImages.DEAD,
                    },
                    interaction,
                );
            }

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
                title: i18n.translate(locale, "command.news.title"),
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

    static subscribeNews = async (
        messageContext: MessageContext,
        range: NewsRange,
        interaction: Eris.CommandInteraction,
    ): Promise<void> => {
        const alreadySubscribed = await dbContext.kmq
            .selectFrom("news_subscriptions")
            .selectAll()
            .where("guild_id", "=", messageContext.guildID)
            .where("text_channel_id", "=", messageContext.textChannelID)
            .where("range", "=", range)
            .executeTakeFirst();

        if (alreadySubscribed) {
            await sendErrorMessage(
                messageContext,
                {
                    title: i18n.translate(
                        messageContext.guildID,
                        "command.news.subscribe.alreadySubscribed.title",
                    ),
                    description: i18n.translate(
                        messageContext.guildID,
                        "command.news.subscribe.alreadySubscribed.description",
                    ),
                    thumbnailUrl: KmqImages.DEAD,
                },
                interaction,
            );
            return;
        }

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

        await sendInfoMessage(
            messageContext,
            {
                title: i18n.translate(
                    messageContext.guildID,
                    "command.news.subscribe.title",
                ),
                description: i18n.translate(
                    messageContext.guildID,
                    "command.news.subscribe.description",
                    { interval: `\`${range}\`` },
                ),
                thumbnailUrl: KmqImages.THUMBS_UP,
            },
            false,
            undefined,
            [],
            interaction,
        );
    };

    static unsubscribeNews = async (
        messageContext: MessageContext,
        range: NewsRange,
        interaction: Eris.CommandInteraction,
    ): Promise<void> => {
        const alreadySubscribed = await dbContext.kmq
            .selectFrom("news_subscriptions")
            .selectAll()
            .where("guild_id", "=", messageContext.guildID)
            .where("text_channel_id", "=", messageContext.textChannelID)
            .where("range", "=", range)
            .executeTakeFirst();

        if (!alreadySubscribed) {
            await sendErrorMessage(
                messageContext,
                {
                    title: i18n.translate(
                        messageContext.guildID,
                        "command.news.unsubscribe.notSubscribed.title",
                    ),
                    description: i18n.translate(
                        messageContext.guildID,
                        "command.news.unsubscribe.notSubscribed.description",
                    ),
                    thumbnailUrl: KmqImages.DEAD,
                },
                interaction,
            );
            return;
        }

        await dbContext.kmq
            .deleteFrom("news_subscriptions")
            .where("guild_id", "=", messageContext.guildID)
            .where("range", "=", range)
            .execute();

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
                    { interval: `\`${range}\`` },
                ),
                thumbnailUrl: KmqImages.DEAD,
            },
            false,
            undefined,
            [],
            interaction,
        );
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

        if (interactionName === Action.SUBSCRIBE) {
            const range = interactionOptions[RANGE_OPTION] as NewsRange;
            await NewsCommand.subscribeNews(messageContext, range, interaction);
        } else if (interactionName === Action.UNSUBSCRIBE) {
            const range = interactionOptions[RANGE_OPTION] as NewsRange;
            await NewsCommand.unsubscribeNews(
                messageContext,
                range,
                interaction,
            );
        } else if (
            [Action.DAILY, Action.WEEKLY, Action.MONTHLY].includes(
                interactionName as Action,
            )
        ) {
            const range = interactionName as NewsRange;
            await NewsCommand.sendNews(
                messageContext,
                range,
                false,
                interaction,
            );
        }
    }
}
