import { IPCLogger } from "../logger";
import { KMQ_USER_AGENT } from "../constants";
import Snoowrap from "snoowrap";
import type NewsRange from "src/enums/news_range";

const logger = new IPCLogger("reddit_client");

export interface KpopNewsRedditPost {
    title: string;
    link: string;
    date: Date;
    flair: string;
}

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
        "Meta",
    ];

    const flairedFilters = filters.map((x) => `flair:'${x}'`);
    return `NOT (${flairedFilters.join(" OR ")})`;
};

export class RedditClient {
    private client: Snoowrap;

    constructor() {
        this.client = new Snoowrap({
            clientId: process.env.REDDIT_CLIENT_ID,
            clientSecret: process.env.REDDIT_CLIENT_SECRET,
            userAgent: KMQ_USER_AGENT,
            refreshToken: process.env.REDDIT_CLIENT_REFRESH_TOKEN,
        });
    }

    async getRecentPopularPosts(): Promise<Array<KpopNewsRedditPost>> {
        try {
            const matchingPosts = await this.client.search({
                subreddit: "kpop",
                query: "flair:'news' OR flair:'Tour News' OR flair:'Rumor' OR flair:'Achievement'",
                sort: "top",
                time: "week",
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
        try {
            const matchingPosts = await this.client.search({
                subreddit: "kpop",
                query: generateFilteredQuery(),
                sort: "top",
                time: interval,
            });

            const popularPosts = matchingPosts
                .filter((x) => x.score > 100)
                .slice(0, 25);

            return popularPosts.map((x) => ({
                title: x.title,
                link: `https://reddit.com${x.permalink}`,
                date: new Date(x.created_utc * 1000),
                flair: x.link_flair_css_class as string,
                x: Date.now() - new Date(x.created_utc * 1000).getTime(),
            }));
        } catch (e) {
            logger.error(
                `Failed to fetch getTopDayPosts(). e = ${JSON.stringify(e)}`,
            );
            return [];
        }
    }
}
