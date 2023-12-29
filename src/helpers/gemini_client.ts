import { GoogleGenerativeAI } from "@google/generative-ai";
import { IPCLogger } from "../logger";
import { standardDateFormat } from "./utils";
import LocaleType from "../enums/locale_type";
import State from "../state";
import type { GenerativeModel } from "@google/generative-ai";

const logger = new IPCLogger("gemini_client");

enum Interval {
    DAY = "today",
    WEEK = "this week",
}

const getNewsPrompt = (
    posts: Array<Object>,
    interval: Interval,
    locale: LocaleType,
): string => {
    let prompt = `You are Kimiqo, a friendly 23 year old K-pop enthusiast who follows the latest updates in K-pop. You are giving an update on the latest happenings in K-pop for a game called KMQ (K-pop Music Quiz). You will be given a string delimited by |, where each column is: the date, the type of post, and the title of the post. The posts are sorted by priority/significance.  Make sure to address the message to KMQ fans/players, and mention who you are. Limit your response to 250 words, even if it means you have to ignore some of the data.

    Summarize ${interval} in K-pop in paragraph form (multiple paragraphs if needed), from the POV of an excited and preppy K-pop fan. Add a lot of personality to the summary. Use emojis where appropriate.`;

    if (locale !== LocaleType.EN) {
        prompt += ` Respond in the locale ${locale}.`;
    }

    return `${prompt} Data is below.\n:\n ${posts.join("\n")}`;
};

export default class GeminiClient {
    private client: GenerativeModel;

    constructor() {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
        this.client = genAI.getGenerativeModel({ model: "gemini-pro" });
    }

    async getDailyPostSummary(locale: LocaleType): Promise<string> {
        try {
            const topDayPosts = (await State.redditClient.getTopDayPosts()).map(
                (x) =>
                    `${standardDateFormat(x.date)} | ${x.flair} | ${x.title}`,
            );

            return (
                await this.client.generateContent(
                    getNewsPrompt(topDayPosts, Interval.DAY, locale),
                )
            ).response.text();
        } catch (e) {
            logger.error(
                `Failed to fetch getDailyPostSummary(). e = ${JSON.stringify(
                    e,
                )}`,
            );
            return "";
        }
    }

    async getWeeklyPostSummary(locale: LocaleType): Promise<string> {
        try {
            const topWeekPosts = (
                await State.redditClient.getTopWeekPosts()
            ).map(
                (x) =>
                    `${standardDateFormat(x.date)} | ${x.flair} | ${x.title}`,
            );

            return (
                await this.client.generateContent(
                    getNewsPrompt(topWeekPosts, Interval.WEEK, locale),
                )
            ).response.text();
        } catch (e) {
            logger.error(
                `Failed to fetch getWeeklyPostSummary(). e = ${JSON.stringify(
                    e,
                )}`,
            );
            return "";
        }
    }
}
