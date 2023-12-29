// TODO rename this to news.ts
import { IPCLogger } from "../../logger";
import { KmqImages } from "../../constants";
import { chooseRandom, clickableSlashCommand } from "../../helpers/utils";
import {
    getDebugLogHeader,
    getInteractionValue,
    sendDeprecatedTextCommandMessage,
    sendErrorMessage,
    sendInfoMessage,
    tryInteractionAcknowledge,
} from "../../helpers/discord_utils";
import Eris from "eris";
import LocaleType from "../../enums/locale_type";
import MessageContext from "../../structures/message_context";
import State from "../../state";
import i18n from "../../helpers/localization_manager";
import type { DefaultSlashCommand } from "../interfaces/base_command";
import type BaseCommand from "../interfaces/base_command";
import type CommandArgs from "../../interfaces/command_args";
import type HelpDocumentation from "../../interfaces/help";
import dbContext from "../../database_context";
import NewsSubscription from "../../interfaces/news_subscription";
import schedule from "node-schedule";

export enum NewsRange {
    DAY = "day",
    WEEK = "week",
}

enum Action {
    SUBSCRIBE = "subscribe",
    UNSUBSCRIBE = "unsubscribe",
    GET = "get",
}

const RANGE_OPTION = "range";

const COMMAND_NAME = "kmqnews";
const logger = new IPCLogger(COMMAND_NAME);

const scheduledJobName = (guildID: string, textChannelID: string, range: NewsRange): string => `${guildID}-${textChannelID}-${range}`;

export default class KmqNewsCommand implements BaseCommand {
    help = (guildID: string): HelpDocumentation => ({
        name: COMMAND_NAME,
        description: i18n.translate(guildID, "command.kmqnews.help.description"),
        examples: [
            {
                example: `${clickableSlashCommand(
                    COMMAND_NAME,
                )} ${Action.GET} ${RANGE_OPTION}:${NewsRange.DAY}`,
                explanation: i18n.translate(
                    guildID,
                    "command.kmqnews.help.example.get",
                ),

            },
            {
                example: `${clickableSlashCommand(
                    COMMAND_NAME,
                )} ${Action.SUBSCRIBE} ${RANGE_OPTION}:${NewsRange.WEEK}`,
                explanation: i18n.translate(
                    guildID,
                    "command.kmqnews.help.example.subscribe",
                ),
            },
            {
                example: `${clickableSlashCommand(
                    COMMAND_NAME,
                )} ${Action.UNSUBSCRIBE} ${RANGE_OPTION}:${NewsRange.DAY}`,
                explanation: i18n.translate(
                    guildID,
                    "command.kmqnews.help.example.unsubscribe",
                ),
            },
        ],
        priority: 500,
    });

    call = async ({ message }: CommandArgs): Promise<void> => {
        logger.warn("Text-based command not supported for kmqnews");
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
                    description: i18n.translate(LocaleType.EN, "command.kmqnews.help.description"),
                    description_localizations: Object.values(LocaleType)
                        .filter((x) => x !== LocaleType.EN)
                        .reduce(
                            (acc, locale) => ({
                                ...acc,
                                [locale]: i18n.translate(
                                    locale,
                                    "command.kmqnews.help.description",
                                ),
                            }),
                            {},
                        ),
                    type: Eris.Constants.ApplicationCommandOptionTypes.SUB_COMMAND,
                    options: [
                        {
                            name: RANGE_OPTION,
                            description: i18n.translate(LocaleType.EN, "command.kmqnews.help.interaction.range"),
                            description_localizations: Object.values(LocaleType)
                                .filter((x) => x !== LocaleType.EN)
                                .reduce(
                                    (acc, locale) => ({
                                        ...acc,
                                        [locale]: i18n.translate(
                                            locale,
                                            "command.kmqnews.help.interaction.range",
                                        ),
                                    }),
                                    {},
                                ),
                            type: Eris.Constants.ApplicationCommandOptionTypes.STRING,
                            required: true,
                            choices: Object.values(NewsRange).map(
                                (newsRange) => ({
                                    name: newsRange,
                                    value: newsRange,
                                }),
                            ),
                        }
                    ]
                },
                {
                    name: Action.SUBSCRIBE,
                    description: i18n.translate(LocaleType.EN, "command.kmqnews.help.interaction.subscribe"),
                    description_localizations: Object.values(LocaleType)
                        .filter((x) => x !== LocaleType.EN)
                        .reduce(
                            (acc, locale) => ({
                                ...acc,
                                [locale]: i18n.translate(
                                    locale,
                                    "command.kmqnews.help.interaction.subscribe",
                                ),
                            }),
                            {},
                        ),
                    type: Eris.Constants.ApplicationCommandOptionTypes.SUB_COMMAND,
                    options: [
                        {
                            name: RANGE_OPTION,
                            description: i18n.translate(LocaleType.EN, "command.kmqnews.help.interaction.range"),
                            description_localizations: Object.values(LocaleType)
                                .filter((x) => x !== LocaleType.EN)
                                .reduce(
                                    (acc, locale) => ({
                                        ...acc,
                                        [locale]: i18n.translate(
                                            locale,
                                            "command.kmqnews.help.interaction.range",
                                        ),
                                    }),
                                    {},
                                ),
                            type: Eris.Constants.ApplicationCommandOptionTypes.STRING,
                            required: true,
                            choices: Object.values(NewsRange).map(
                                (newsRange) => ({
                                    name: newsRange,
                                    value: newsRange,
                                }),
                            ),
                        }
                    ]
                },
                {
                    name: Action.UNSUBSCRIBE,
                    description: i18n.translate(LocaleType.EN, "command.kmqnews.help.interaction.unsubscribe"),
                    description_localizations: Object.values(LocaleType)
                        .filter((x) => x !== LocaleType.EN)
                        .reduce(
                            (acc, locale) => ({
                                ...acc,
                                [locale]: i18n.translate(
                                    locale,
                                    "command.kmqnews.help.interaction.unsubscribe",
                                ),
                            }),
                            {},
                        ),
                    type: Eris.Constants.ApplicationCommandOptionTypes.SUB_COMMAND,
                    options: [
                        {
                            name: RANGE_OPTION,
                            description: i18n.translate(LocaleType.EN, "command.kmqnews.help.interaction.range"),
                            description_localizations: Object.values(LocaleType)
                                .filter((x) => x !== LocaleType.EN)
                                .reduce(
                                    (acc, locale) => ({
                                        ...acc,
                                        [locale]: i18n.translate(
                                            locale,
                                            "command.kmqnews.help.interaction.range",
                                        ),
                                    }),
                                    {},
                                ),
                            type: Eris.Constants.ApplicationCommandOptionTypes.STRING,
                            required: true,
                            choices: Object.values(NewsRange).map(
                                (newsRange) => ({
                                    name: newsRange,
                                    value: newsRange,
                                }),
                            ),
                        }
                    ]
                }
            ]
        },
    ];

    static sendNews = async (
        messageContext: MessageContext,
        range: NewsRange,
        interaction?: Eris.CommandInteraction,
    ): Promise<void> => {
        if (interaction) await tryInteractionAcknowledge(interaction);
        const locale = State.getGuildLocale(messageContext.guildID);

        let summary: string;
        if (range === NewsRange.DAY) {
            summary = await State.geminiClient.getDailyPostSummary(locale);
        } else {
            summary = await State.geminiClient.getWeeklyPostSummary(locale);
        }

        if (summary === "") {
            await sendErrorMessage(messageContext, {
                title: i18n.translate(messageContext.guildID, "command.kmqnews.errorGenerating.title"),
                description: i18n.translate(messageContext.guildID, "command.kmqnews.errorGenerating.description"),
                thumbnailUrl: KmqImages.DEAD,
            })

            return;
        }

        // TODO add disclaimer footer
        const thumbnail = chooseRandom([KmqImages.THUMBS_UP, KmqImages.HAPPY, KmqImages.READING_BOOK])
        if (interaction) {
            await interaction.createFollowup({
                embeds: [
                    {
                    title: i18n.translate(
                        messageContext.guildID,
                        "command.kmqnews.title",
                    ),
                    description: summary,
                        thumbnail: {
                            url: thumbnail,
                        },
                    }
                ]
            })
        } else {
            await sendInfoMessage(messageContext, {
                title: i18n.translate(
                    messageContext.guildID,
                    "command.kmqnews.title",
                ),
                description: summary,
                thumbnailUrl: thumbnail,
            })
        }

        logger.info(`${getDebugLogHeader(messageContext)} | Kpop news retrieved.`);
    };

    static scheduleNewsJob = (subscription: NewsSubscription): void => {
        const subscriptionContext = new MessageContext(subscription.textChannelID, null, subscription.guildID)
        const jobName = scheduledJobName(subscription.guildID, subscription.textChannelID, subscription.range)

        if (subscription.range === NewsRange.DAY) {
            schedule.scheduleJob(jobName, "0 0 * * *", async () => {
                await KmqNewsCommand.sendNews(subscriptionContext, subscription.range);
            })
        } else if (subscription.range === NewsRange.WEEK) {
            schedule.scheduleJob(jobName, "0 0 * * 0", async () => {
                await KmqNewsCommand.sendNews(subscriptionContext, subscription.range);
            })
        }
    }

    static subscribeNews = async (messageContext: MessageContext, range: NewsRange, interaction: Eris.CommandInteraction): Promise<void> => {
        const subscription: NewsSubscription = {
            guildID: messageContext.guildID,
            textChannelID: messageContext.textChannelID,
            range,
            createdAt: new Date(),
        }

        await dbContext.kmq.insertInto("news_subscriptions").values({
            guild_id: subscription.guildID,
            text_channel_id: subscription.textChannelID,
            range: subscription.range,
            created_at: subscription.createdAt,
        }).onDuplicateKeyUpdate({
            guild_id: subscription.guildID,
            text_channel_id: subscription.textChannelID,
            range: subscription.range,
            created_at: subscription.createdAt,
        }).execute()

        this.scheduleNewsJob(subscription)

        await sendInfoMessage(messageContext, {
            title: i18n.translate(messageContext.guildID, "command.kmqnews.subscribe.title"),
            description: i18n.translate(messageContext.guildID, "command.kmqnews.subscribe.description")
        })

        await this.sendNews(messageContext, range, interaction)
    }

    static unsubscribeNews = async (messageContext: MessageContext, range: NewsRange, interaction: Eris.CommandInteraction): Promise<void> => {
        await sendInfoMessage(messageContext, {
            title: i18n.translate(messageContext.guildID, "command.kmqnews.unsubscribe.title"),
            description: i18n.translate(messageContext.guildID, "command.kmqnews.unsubscribe.description")
        }, false, undefined, [], interaction)

        schedule.cancelJob(scheduledJobName(messageContext.guildID, messageContext.textChannelID, range))

        await dbContext.kmq.deleteFrom("news_subscriptions")
            .where("guild_id", "=", messageContext.guildID)
            .where("range", "=", range)
            .execute()
    }

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
            await KmqNewsCommand.subscribeNews(messageContext, range, interaction);
        } else if (interactionName === Action.UNSUBSCRIBE) {
            await KmqNewsCommand.unsubscribeNews(messageContext, range, interaction);
        } else if (interactionName === Action.GET) {
            await KmqNewsCommand.sendNews(messageContext, range, interaction);
        }
    }
}
