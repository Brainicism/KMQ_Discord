import * as schedule from "node-schedule";
import { BaseServiceWorker } from "eris-fleet";
import { IPCLogger } from "./logger";
import { RedditClient } from "./helpers/reddit_client";
import { chooseRandom, retryJob } from "./helpers/utils";
import BotListingManager from "./helpers/bot_listing_manager";
import EnvType from "./enums/env_type";
import FactGenerator from "./fact_generator";
import GeminiClient from "./helpers/gemini_client";
import LocaleType from "./enums/locale_type";
import NewsRange from "./enums/news_range";
import type { KpopNewsRedditPost } from "./helpers/reddit_client";
import type { Setup } from "eris-fleet/dist/services/BaseServiceWorker";
import type FactCache from "./interfaces/fact_cache";
import type NewsSummary from "./interfaces/news_summary";

const logger = new IPCLogger("kmq_service");

export default class ServiceWorker extends BaseServiceWorker {
    news: {
        [range: string]: {
            [locale: string]: NewsSummary;
        };
    };

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

        this.news = {};
        for (const range of Object.values(NewsRange)) {
            this.news[range] = {};
        }

        schedule.scheduleJob("0 * * * *", () => {
            // Use reddit and Gemini to generate news
            this.reloadNews();
        });

        schedule.scheduleJob("0 */6 * * *", () => {
            this.reloadFactCache();
        });

        if (process.env.MINIMAL_RUN !== "true") {
            this.reloadNews();
            this.reloadFactCache();
        }

        this.serviceReady();
    }

    // eslint-disable-next-line @typescript-eslint/require-await
    handleCommand = async (commandName: string): Promise<any> => {
        logger.info(`Received command: ${commandName}`);
        const components = commandName.split("|");
        components.shift();
        if (commandName.startsWith("getNews")) {
            const newsRange = components[0];
            const locale = components[1];
            const news = this.news[newsRange][locale];
            if (!news) {
                logger.error(
                    `News for ${components.join("-")} not yet generated`,
                );
                return null;
            }

            return news;
        } else if (commandName.startsWith("getFact")) {
            const factType = components[0];
            const locale = components[1];
            let factGroup: string[][] | null;
            switch (factType) {
                case "fun":
                    factGroup = this.facts[locale].funFacts;
                    break;
                case "kmq":
                    factGroup = this.facts[locale].kmqFacts;
                    break;
                case "news":
                    factGroup = this.facts[locale].newsFacts;
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
                // eslint-disable-next-line no-await-in-loop
                await retryJob<void | Error>(
                    async () => {
                        if (!rangeToTopPosts[range]) {
                            logger.warn(
                                `Skipping generating news for ${locale} ${range} because topPosts is null`,
                            );
                            return Promise.resolve();
                        }

                        const summary = await geminiClient.getPostSummary(
                            locale as LocaleType,
                            range as NewsRange,
                            rangeToTopPosts[range],
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

                        this.news[range][locale] = {
                            text: summary,
                            generatedAt: Date.now(),
                        };

                        logger.info(`Generated news for ${locale} ${range}`);
                        return Promise.resolve();
                    },
                    [],
                    3,
                    true,
                    60000,
                    false,
                );
            }
        }
    }

    shutdown = (done: () => void): void => {
        done();
    };
}
