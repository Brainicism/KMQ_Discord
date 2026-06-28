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
            // Every hour
            schedule.scheduleJob("0 * * * *", async () => {
                // Use reddit and Gemini to generate news
                await this.reloadNews();
            });

            // Every 6 hours
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
                .select("content")
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
            logger.info("Skipping news generation, GEMINI_API_KEY is not set");
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

        const locales = Object.values(LocaleType);
        const freshnessCutoff = new Date(new Date().getTime() - 60 * 60 * 1000);

        for (const range of Object.values(NewsRange)) {
            const topPosts = rangeToTopPosts[range];
            if (!topPosts) {
                logger.warn(
                    `Skipping generating news for ${range} because topPosts is null`,
                );
                continue;
            }

            // Skip locales whose entry was generated within the last hour.
            // eslint-disable-next-line no-await-in-loop
            const freshEntries = await dbContext.kmq
                .selectFrom("news")
                .select("identifier")
                .where(
                    "identifier",
                    "in",
                    locales.map((locale) => `${locale}-${range}`),
                )
                .where("generated_at", ">", freshnessCutoff)
                .execute();

            const freshIdentifiers = new Set(
                freshEntries.map((entry) => entry.identifier),
            );

            const localesToGenerate = locales.filter(
                (locale) => !freshIdentifiers.has(`${locale}-${range}`),
            );

            if (localesToGenerate.length === 0) {
                logger.info(
                    `Skipping news generation for ${range}, all locale entries too fresh.`,
                );
                continue;
            }

            try {
                // One request per range covers every locale. A call per locale
                // exhausted the requests-per-minute quota while barely using
                // the token allowance, so batch the languages together. Retry
                // only fires when the whole batch is unusable, keeping us well
                // under the RPM limit even on partial failures.
                // eslint-disable-next-line no-await-in-loop
                await retryJob<void | Error>(
                    async () => {
                        const summaries = await geminiClient.getPostSummaries(
                            range as NewsRange,
                            topPosts,
                            localesToGenerate,
                        );

                        const rows: Array<Insertable<News>> = [];
                        for (const locale of localesToGenerate) {
                            const summary = summaries.get(locale);
                            if (!summary) {
                                logger.warn(
                                    `Missing news summary for ${locale} ${range}`,
                                );
                                continue;
                            }

                            if (summary.length < 300 || summary.length > 2500) {
                                logger.warn(
                                    `Received abnormally sized news entry for ${locale} ${range}. length = ${summary.length}`,
                                );
                                continue;
                            }

                            rows.push({
                                identifier: `${locale}-${range}`,
                                content: summary,
                                generated_at: new Date(),
                            });
                        }

                        if (rows.length === 0) {
                            return Promise.reject(
                                new Error(`Error generating news for ${range}`),
                            );
                        }

                        await Promise.all(
                            rows.map((row) =>
                                dbContext.kmq
                                    .insertInto("news")
                                    .values(row)
                                    .onDuplicateKeyUpdate(row)
                                    .execute(),
                            ),
                        );

                        logger.info(
                            `Generated news for ${range} (${rows.length}/${localesToGenerate.length} locales)`,
                        );
                        return Promise.resolve();
                    },
                    [],
                    3,
                    true,
                    60 * 1000,
                    false,
                );
            } catch (err) {
                logger.warn(
                    `Failed to generate news for ${range}. err = ${err}`,
                );
            }
        }
    }

    shutdown = (done: () => void): void => {
        done();
    };
}
