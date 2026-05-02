import { IPCLogger } from "../logger";
import { KMQ_USER_AGENT } from "../constants";
import NewsRange from "../enums/news_range";
import axios from "axios";
import type { AxiosInstance } from "axios";

const logger = new IPCLogger("reddit_client");

const REDDIT_AUTH_URL = "https://www.reddit.com/api/v1/access_token";
const REDDIT_API_BASE = "https://oauth.reddit.com";
const TOKEN_EXPIRY_BUFFER_MS = 60_000;

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

interface RedditPost {
    title: string;
    score: number;
    created_utc: number;
    permalink: string;
    link_flair_css_class: string;
    link_flair_text: string;
}

interface RedditSearchParams {
    subreddit: string;
    query: string;
    sort: string;
    time: RedditInterval;
    limit?: number;
}

interface TokenCache {
    token: string;
    expiresAt: number;
}

interface RedditCredentials {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
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
        "Megathread",
        "Pictorial",
    ];

    const flairedFilters = filters.map((x) => `flair:"${x}"`);
    return `NOT (${flairedFilters.join(" OR ")})`;
};

export class RedditClient {
    private readonly credentials: RedditCredentials | null;
    private tokenCache: TokenCache | null = null;
    private readonly http: AxiosInstance;

    constructor() {
        const {
            REDDIT_CLIENT_ID,
            REDDIT_CLIENT_SECRET,
            REDDIT_CLIENT_REFRESH_TOKEN,
        } = process.env;

        if (
            !REDDIT_CLIENT_ID ||
            !REDDIT_CLIENT_SECRET ||
            !REDDIT_CLIENT_REFRESH_TOKEN
        ) {
            logger.warn(
                "Reddit credentials not specified, skipping client initialization...",
            );
            this.credentials = null;
            this.http = axios.create();
            return;
        }

        this.credentials = {
            clientId: REDDIT_CLIENT_ID,
            clientSecret: REDDIT_CLIENT_SECRET,
            refreshToken: REDDIT_CLIENT_REFRESH_TOKEN,
        };

        this.http = axios.create({
            baseURL: REDDIT_API_BASE,
            headers: { "User-Agent": KMQ_USER_AGENT },
        });
    }

    async getRecentPopularPosts(): Promise<Array<KpopNewsRedditPost>> {
        if (!this.credentials) return [];

        try {
            const posts = await this.search({
                subreddit: "kpop",
                query: "flair:'news' OR flair:'Tour News' OR flair:'Rumor' OR flair:'Achievement'",
                sort: "top",
                time: RedditInterval.WEEK,
            });

            return posts
                .filter((x) => x.score > 100)
                .filter(
                    (x) =>
                        Date.now() - new Date(x.created_utc * 1000).getTime() <=
                        3 * 24 * 60 * 60 * 1000,
                )
                .map((x) => ({
                    title: x.title,
                    link: `https://reddit.com${x.permalink}`,
                    date: new Date(x.created_utc * 1000),
                    flair: x.link_flair_css_class,
                }));
        } catch (e) {
            logger.error(
                `Failed to fetch getRecentPopularPosts(). e = ${JSON.stringify(e)}`,
            );
            return [];
        }
    }

    async getTopPosts(interval: NewsRange): Promise<Array<KpopNewsRedditPost>> {
        if (!this.credentials) return [];

        try {
            const posts = await this.search({
                subreddit: "kpop",
                query: generateFilteredQuery(),
                sort: "top",
                time: newsRangeToRedditInterval(interval),
                limit: 30,
            });

            return posts
                .filter((x) => x.score > 100)
                .filter((x) => !x.title.toLowerCase().includes("pictorial"))
                .slice(0, 25)
                .map((x) => {
                    const flairGroup = x.link_flair_css_class;
                    let flair = x.link_flair_text.toLowerCase();
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
                    };
                })
                .filter(
                    (x) =>
                        !x.flair.startsWith("teaser") &&
                        !x.flair.includes("ama") &&
                        !x.title.toLowerCase().includes("dance practice"),
                );
        } catch (e) {
            logger.warn(
                `Failed to fetch getTopPosts(). interval = ${newsRangeToRedditInterval(interval)}. e = ${e}`,
            );
            return [];
        }
    }

    private async getAccessToken(): Promise<string> {
        if (this.tokenCache && Date.now() < this.tokenCache.expiresAt) {
            return this.tokenCache.token;
        }

        const { clientId, clientSecret, refreshToken } = this.credentials!;
        const response = await axios.post<{
            access_token: string;
            expires_in: number;
        }>(
            REDDIT_AUTH_URL,
            new URLSearchParams({
                grant_type: "refresh_token",
                refresh_token: refreshToken,
            }),
            {
                auth: { username: clientId, password: clientSecret },
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "User-Agent": KMQ_USER_AGENT,
                },
            },
        );

        const accessToken = response.data.access_token;
        const expiresIn = response.data.expires_in;
        this.tokenCache = {
            token: accessToken,
            expiresAt: Date.now() + expiresIn * 1000 - TOKEN_EXPIRY_BUFFER_MS,
        };

        return accessToken;
    }

    private async search(params: RedditSearchParams): Promise<RedditPost[]> {
        const token = await this.getAccessToken();
        const response = await this.http.get<{
            data: { children: Array<{ data: RedditPost }> };
        }>(`/r/${params.subreddit}/search`, {
            params: {
                q: params.query,
                sort: params.sort,
                t: params.time,
                limit: params.limit ?? 25,
                restrict_sr: true,
                raw_json: 1,
            },
            headers: { Authorization: `Bearer ${token}` },
        });

        return response.data.data.children.map((child) => child.data);
    }
}
