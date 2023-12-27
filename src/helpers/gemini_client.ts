import { GoogleGenerativeAI } from "@google/generative-ai";
import { IPCLogger } from "../logger";
import State from "../state";
import type { GenerativeModel} from "@google/generative-ai";

const logger = new IPCLogger("gemini_client");

export default class GeminiClient {
    private client: GenerativeModel;

    constructor() {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
        this.client = genAI.getGenerativeModel({ model: "gemini-pro" })
    }

    async getDailyPostSummary(): Promise<string> {
        try {
            const topDayPosts = (await State.redditClient.getTopDayPosts()).map((x) => ({ title: x.title, link: x.link, date: x.date }));

            const prompt = `Give a newscaster summary for 2-3 of the most interesting events for today in k-pop news, based on the following information. Do not add new information not verifiable from the story. Only report on good news. Respond on one line:\n ${JSON.stringify(topDayPosts)}`

            return (await this.client.generateContent(prompt)).response.text();
        } catch (e) {
            logger.error(
                `Failed to fetch getDailyPostSummary(). e = ${JSON.stringify(
                    e,
                )}`,
            );
            return "";
        }
    }

    async getWeeklyPostSummary(): Promise<string> {
        try {
            const topWeekPosts = (await State.redditClient.getTopWeekPosts()).map((x) => ({ title: x.title, link: x.link, date: x.date }));

            const prompt = `Give a newscaster summary for 3-5 of the most interesting events for this week in k-pop news, based on the following information. Do not add new information not verifiable from the story. Only report on good news. Respond on one line:\n ${JSON.stringify(topWeekPosts)}`

            return (await this.client.generateContent(prompt)).response.text();
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
