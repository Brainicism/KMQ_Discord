import { GoogleGenerativeAI } from "@google/generative-ai";
import { IPCLogger } from "../logger";
import { standardDateFormat } from "./utils";
import LocaleType from "../enums/locale_type";
import NewsRange from "../enums/news_range";
import type { GenerativeModel } from "@google/generative-ai";
import type { KpopNewsRedditPost } from "./reddit_client";

const logger = new IPCLogger("gemini_client");

enum PromptInterval {
    DAY = "today",
    WEEK = "this week",
    MONTH = "this month",
}

const newsRangeToPromptInterval = (newsRange: NewsRange): PromptInterval => {
    switch (newsRange) {
        case NewsRange.DAILY:
            return PromptInterval.DAY;
        case NewsRange.WEEKLY:
            return PromptInterval.WEEK;
        case NewsRange.MONTHLY:
            return PromptInterval.MONTH;
        default:
            throw new Error(`Invalid newsRange: ${newsRange}`);
    }
};

const getNewsPrompt = (
    posts: Array<Object>,
    interval: PromptInterval,
    locale: LocaleType,
): string => {
    let prompt = `You are Kimiqo, a friendly 23 year old K-pop enthusiast who follows the latest updates in K-pop. You are giving an update on the latest happenings in K-pop for a game called KMQ (K-pop Music Quiz). You will be given a string delimited by |, where each column is: the date, the type of post, and the title of the post. The posts are sorted by priority/significance.  Make sure to address the message to KMQ fans/players, and mention who you are. Limit your response to 250 words, even if it means you have to ignore some of the data.

Summarize ${interval} in K-pop in paragraph form (multiple paragraphs if needed), from the POV of an excited and preppy K-pop fan. Add a lot of personality to the summary. Use emojis where appropriate.`;

    if (locale !== LocaleType.EN) {
        prompt += ` Respond in the locale: ${locale}.`;
    }

    return `${prompt} Data is below:\n${posts.join("\n")}\n`;
};

export default class GeminiClient {
    private client: GenerativeModel;

    constructor() {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
        this.client = genAI.getGenerativeModel({ model: "gemini-pro" });
    }

    async getPostSummary(
        locale: LocaleType,
        newsRange: NewsRange,
        topPosts: Array<KpopNewsRedditPost>,
    ): Promise<string> {
        try {
            const formattedTopPosts = topPosts.map(
                (x) =>
                    `${standardDateFormat(x.date)} | ${x.flair} | ${x.title}`,
            );

            const prompt = getNewsPrompt(
                formattedTopPosts,
                newsRangeToPromptInterval(newsRange),
                locale,
            );

            const generatedContent = await this.client.generateContent(prompt);

            const text = generatedContent.response.text();
            if (text === "") {
                throw new Error(
                    `Failed to generate text. generatedContent = ${JSON.stringify(
                        generatedContent,
                    )}. prompt = ${prompt}`,
                );
            }

            return text;
        } catch (e) {
            logger.warn(
                `Failed to fetch getPostSummary(). locale = ${locale}. newsRange = ${newsRange}. e = ${e}`,
            );
            return "";
        }
    }
}
