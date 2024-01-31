import { IPCLogger } from "../logger";
import { KMQ_USER_AGENT } from "../constants";
import NewsRange from "../enums/news_range";
import Snoowrap from "snoowrap";

const logger = new IPCLogger("reddit_client");

export interface KpopNewsRedditPost {
    title: string;
    link: string;
    date: Date;
    flair: string;
}

enum RedditInterval {
    DAY = "day",
    WEEK = "week",
    MONTH = "month",
}

const newsRangeToRedditInterval = (newsRange: NewsRange): RedditInterval => {
    switch (newsRange) {
        case NewsRange.DAILY:
            return RedditInterval.DAY;
        case NewsRange.WEEKLY:
            return RedditInterval.WEEK;
        case NewsRange.MONTHLY:
            return RedditInterval.MONTH;
        default:
            throw new Error(`Invalid newsRange: ${newsRange}`);
    }
};

const generateFilteredQuery = (): string => {
    const filters = [
        "Song Cover",
        "Live",
        "Variety",
        "Behind-The-Scenes",
        "CF",
        "Audio",
        "Interview",
        "Dance Challenge",
        "Dance Practice",
        "Meta",
    ];

    const flairedFilters = filters.map((x) => `flair:"${x}"`);
    return `NOT (${flairedFilters.join(" OR ")})`;
};

export class RedditClient {
    private client: Snoowrap | null;

    constructor() {
        if (
            !process.env.REDDIT_CLIENT_ID ||
            process.env.REDDIT_CLIENT_SECRET ||
            process.env.REDDIT_CLIENT_REFRESH_TOKEN
        ) {
            logger.warn(
                "Reddit credentials not specified, skipping client initialization...",
            );
            this.client = null;
            return;
        }

        this.client = new Snoowrap({
            clientId: process.env.REDDIT_CLIENT_ID,
            clientSecret: process.env.REDDIT_CLIENT_SECRET,
            userAgent: KMQ_USER_AGENT,
            refreshToken: process.env.REDDIT_CLIENT_REFRESH_TOKEN,
        });
    }

    async getRecentPopularPosts(): Promise<Array<KpopNewsRedditPost>> {
        if (!this.client) return [];
        try {
            const matchingPosts = await this.client.search({
                subreddit: "kpop",
                query: "flair:'news' OR flair:'Tour News' OR flair:'Rumor' OR flair:'Achievement'",
                sort: "top",
                time: RedditInterval.WEEK,
            });

            const popularPosts = matchingPosts
                .filter((x) => x.score > 100)
                .filter(
                    (x) =>
                        Date.now() - new Date(x.created_utc * 1000).getTime() <=
                        3 * 24 * 60 * 60 * 1000,
                );

            return popularPosts.map((x) => ({
                title: x.title,
                link: `https://reddit.com${x.permalink}`,
                date: new Date(x.created_utc * 1000),
                flair: x.link_flair_css_class as string,
                x: Date.now() - new Date(x.created_utc * 1000).getTime(),
            }));
        } catch (e) {
            logger.error(
                `Failed to fetch getRecentPopularPosts(). e = ${JSON.stringify(
                    e,
                )}`,
            );
            return [];
        }
    }

    async getTopPosts(interval: NewsRange): Promise<Array<KpopNewsRedditPost>> {
        if (!this.client) return [];

        try {
            const matchingPosts = await this.client.search({
                subreddit: "kpop",
                query: generateFilteredQuery(),
                sort: "top",
                time: newsRangeToRedditInterval(interval),
            });

            const popularPosts = matchingPosts
                .filter((x) => x.score > 100)
                .slice(0, 25);

            return popularPosts.map((x) => {
                const flairGroup = x.link_flair_css_class as string;
                let flair = (x.link_flair_text as string).toLowerCase();
                if (flair.startsWith("[") && flair.endsWith("]")) {
                    flair = flair.slice(1, flair.length - 1);
                }

                if (flair === "album discussion") {
                    flair = "album";
                }

                return {
                    title: x.title,
                    link: `https://reddit.com${x.permalink}`,
                    date: new Date(x.created_utc * 1000),
                    flair: `${flairGroup}:${flair}`,
                    x: Date.now() - new Date(x.created_utc * 1000).getTime(),
                };
            });
        } catch (e) {
            logger.warn(
                `Failed to fetch getTopPosts(). interval = ${newsRangeToRedditInterval(
                    interval,
                )}. e = ${e}`,
            );
            return [];
        }
    }
}
