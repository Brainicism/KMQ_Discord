import * as schedule from "node-schedule";
import { BaseServiceWorker } from "eris-fleet";
import { IPCLogger } from "./logger";
import { RedditClient } from "./helpers/reddit_client";
import { chooseRandom, retryJob } from "./helpers/utils";
import BotListingManager from "./helpers/bot_listing_manager";
import EnvType from "./enums/env_type";
import EnvVariableManager from "./env_variable_manager";
import FactGenerator from "./fact_generator";
import GeminiClient from "./helpers/gemini_client";
import KmqConfiguration from "./kmq_configuration";
import LocaleType from "./enums/locale_type";
import NewsRange from "./enums/news_range";
import dbContext from "./database_context";
import type { Insertable } from "kysely";
import type { KpopNewsRedditPost } from "./helpers/reddit_client";
import type { News } from "./typings/kmq_db";
import type { Setup } from "eris-fleet/dist/services/BaseServiceWorker";
import type FactCache from "./interfaces/fact_cache";

const logger = new IPCLogger("kmq_service");

// eslint-disable-next-line import/no-unused-modules
export default class ServiceWorker extends BaseServiceWorker {
    facts: { [locale: string]: FactCache };

    constructor(setup: Setup) {
        super(setup);
        if (process.env.NODE_ENV === EnvType.PROD) {
            logger.info("Initializing bot stats poster...");
            const botListingManager = new BotListingManager(this.ipc);
            botListingManager.start();
        }

        this.facts = {};
        for (const locale of Object.values(LocaleType)) {
            this.facts[locale] = {
                funFacts: [],
                kmqFacts: [],
                newsFacts: [],
                lastUpdated: null,
            };
        }

        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this.loadCaches();
        this.serviceReady();
    }

    loadCaches = async (): Promise<void> => {
        if (!EnvVariableManager.isMinimalRun()) {
            schedule.scheduleJob("0 * * * *", async () => {
                // Use reddit and Gemini to generate news
                await this.reloadNews();
            });

            schedule.scheduleJob("0 */6 * * *", async () => {
                await this.reloadFactCache();
            });

            await this.reloadNews();
            await this.reloadFactCache();
        }
    };

    // eslint-disable-next-line @typescript-eslint/require-await
    handleCommand = async (commandName: string): Promise<any> => {
        logger.info(`Received command: ${commandName}`);
        const components = commandName.split("|");
        components.shift();
        if (commandName.startsWith("getNews")) {
            const newsRange = components[0]!;
            const locale = components[1]!;
            const news = await dbContext.kmq
                .selectFrom("news")
                .select("content as text")
                .where("identifier", "=", `${locale}-${newsRange}`)
                .executeTakeFirst();

            if (!news) {
                logger.error(
                    `News for ${components.join("-")} not yet generated`,
                );
                return null;
            }

            return news;
        } else if (commandName.startsWith("getFact")) {
            const factType = components[0]!;
            const locale = components[1]!;
            let factGroup: string[][] | null;
            const factGroupByLocale = this.facts[locale];
            if (!factGroupByLocale) {
                logger.error(
                    `Facts for ${components.join("-")} not yet generated`,
                );
                return null;
            }

            switch (factType) {
                case "fun":
                    factGroup = factGroupByLocale.funFacts;
                    break;
                case "kmq":
                    factGroup = factGroupByLocale.kmqFacts;
                    break;
                case "news":
                    factGroup = factGroupByLocale.newsFacts;
                    break;
                default:
                    logger.error(`Unexpected factType: ${factType}`);
                    factGroup = null;
            }

            if (!factGroup || factGroup.length === 0) return null;
            return chooseRandom(chooseRandom(factGroup));
        }

        logger.error(`Unknown kmq_service command: ${commandName}`);
        return null;
    };

    /**
     * Reloads the fact cache
     */
    async reloadFactCache(): Promise<void> {
        logger.info("Regenerating fact cache...");
        this.facts = await FactGenerator.generateFacts();
        logger.info("Fact cache regenerated!");
    }

    async reloadNews(): Promise<void> {
        if (!KmqConfiguration.Instance.newsGenerationEnabled()) {
            logger.info("Skipping news generation, flag is disabled");
            return;
        }

        if (!process.env.GEMINI_API_KEY) {
            return;
        }

        const geminiClient = new GeminiClient();
        const redditClient = new RedditClient();

        const rangeToTopPosts: { [range: string]: Array<KpopNewsRedditPost> } =
            {};

        await Promise.allSettled(
            Object.values(NewsRange).map(async (range) => {
                try {
                    await retryJob<void | Error>(
                        async () => {
                            const topPosts =
                                await redditClient.getTopPosts(range);

                            if (topPosts.length === 0) {
                                throw new Error(
                                    `Failed to fetch topPosts(). newsRange = ${range}`,
                                );
                            }

                            rangeToTopPosts[range] = topPosts;
                        },
                        [],
                        3,
                        true,
                        60000,
                        false,
                    );
                } catch (err) {
                    logger.warn(
                        `Failed to fetch topPosts(). newsRange = ${range}. err = ${err}`,
                    );
                }
            }),
        );

        for (const locale of Object.values(LocaleType)) {
            for (const range of Object.values(NewsRange)) {
                const newsIdentifier = `${locale}-${range}`;
                // eslint-disable-next-line no-await-in-loop
                const latestEntry = await dbContext.kmq
                    .selectFrom("news")
                    .select("generated_at")
                    .where("identifier", "=", newsIdentifier)
                    .executeTakeFirst();

                // skip generation if news was generated in the past hour
                if (
                    latestEntry &&
                    latestEntry.generated_at >
                        new Date(new Date().getTime() - 60 * 60 * 1000)
                ) {
                    logger.info(
                        `Skipping news generation for ${newsIdentifier}, entry too fresh. ${latestEntry.generated_at.toISOString()}`,
                    );
                    continue;
                }

                try {
                    // eslint-disable-next-line no-await-in-loop
                    await retryJob<void | Error>(
                        async () => {
                            const topPosts = rangeToTopPosts[range];
                            if (!topPosts) {
                                logger.warn(
                                    `Skipping generating news for ${locale} ${range} because topPosts is null`,
                                );
                                return Promise.resolve();
                            }

                            const summary = await geminiClient.getPostSummary(
                                locale as LocaleType,
                                range as NewsRange,
                                topPosts,
                            );

                            if (summary === "") {
                                logger.warn(
                                    `Error generating news for ${locale} ${range}`,
                                );
                                return Promise.reject(
                                    new Error(
                                        `Error generating news for ${locale} ${range}`,
                                    ),
                                );
                            }

                            if (summary.length < 400 || summary.length > 2500) {
                                return Promise.reject(
                                    new Error(
                                        `Received abnormally sized news entry for ${locale} ${range}. length = ${summary.length}`,
                                    ),
                                );
                            }

                            const updatePayload: Insertable<News> = {
                                identifier: newsIdentifier,
                                content: summary,
                                generated_at: new Date(),
                            };

                            await dbContext.kmq
                                .insertInto("news")
                                .values(updatePayload)
                                .onDuplicateKeyUpdate(updatePayload)
                                .execute();

                            logger.info(
                                `Generated news for ${locale} ${range}`,
                            );
                            return Promise.resolve();
                        },
                        [],
                        3,
                        true,
                        1000,
                        false,
                    );
                } catch (err) {
                    logger.warn(`Failed to generate news. err = ${err}`);
                }
            }
        }
    }

    shutdown = (done: () => void): void => {
        done();
    };
}
