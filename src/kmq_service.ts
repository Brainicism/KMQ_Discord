import * as schedule from "node-schedule";
import { BaseServiceWorker } from "eris-fleet";
import { IPCLogger } from "./logger";
import { retryJob } from "./helpers/utils";
import BotListingManager from "./helpers/bot_listing_manager";
import EnvType from "./enums/env_type";
import GeminiClient from "./helpers/gemini_client";
import LocaleType from "./enums/locale_type";
import NewsRange from "./enums/news_range";
import type { Setup } from "eris-fleet/dist/services/BaseServiceWorker";
import type NewsSummary from "./interfaces/news_summary";

const logger = new IPCLogger("kmq_service");

export default class ServiceWorker extends BaseServiceWorker {
    news: {
        [range: string]: {
            [locale: string]: NewsSummary;
        };
    };

    constructor(setup: Setup) {
        super(setup);
        if (process.env.NODE_ENV === EnvType.PROD) {
            logger.info("Initializing bot stats poster...");
            const botListingManager = new BotListingManager(this.ipc);
            botListingManager.start();
        }

        this.news = {};
        for (const range of Object.values(NewsRange)) {
            this.news[range] = {};
        }

        schedule.scheduleJob("0 * * * *", () => {
            // Use reddit and Gemini to generate news
            this.reloadNews();
        });

        this.reloadNews();
        this.serviceReady();
    }

    // eslint-disable-next-line @typescript-eslint/require-await
    handleCommand = async (commandName: string): Promise<any> => {
        logger.info(`Received command: ${commandName}`);
        if (commandName.startsWith("getNews")) {
            const components = commandName.split("|");
            components.shift();

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
        }

        logger.error(`Unknown kmq_service command: ${commandName}`);
        return null;
    };

    async reloadNews(): Promise<void> {
        if (!process.env.GEMINI_API_KEY) {
            return;
        }

        const geminiClient = new GeminiClient();
        await Promise.allSettled(
            Object.values(LocaleType).map(async (locale) => {
                await Promise.allSettled(
                    Object.values(NewsRange).map(async (range) => {
                        await retryJob<void | Error>(
                            async () => {
                                const summary =
                                    await geminiClient.getPostSummary(
                                        locale,
                                        range,
                                    );

                                if (summary === "") {
                                    logger.error(
                                        `Error generating news for ${locale} ${range}`,
                                    );
                                    return Promise.reject(
                                        new Error(
                                            `Error generating news for ${locale} ${range}`,
                                        ),
                                    );
                                }

                                if (
                                    summary.length < 400 ||
                                    summary.length > 2500
                                ) {
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

                                logger.info(
                                    `Generated news for ${locale} ${range}`,
                                );
                                return Promise.resolve();
                            },
                            [],
                            3,
                            true,
                            60000,
                        );
                    }),
                );
            }),
        );
    }

    shutdown = (done: () => void): void => {
        done();
    };
}
