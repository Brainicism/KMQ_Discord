import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { IPCLogger } from "../logger";
import { standardDateFormat } from "./utils";
import LocaleType from "../enums/locale_type";
import NewsRange from "../enums/news_range";
import type { GenerativeModel, ResponseSchema } from "@google/generative-ai";
import type { KpopNewsRedditPost } from "./reddit_client";

const logger = new IPCLogger("gemini_client");

// One batched request returns a summary for every locale, so the response is
// far larger than a single-locale one. Cap it high enough to fit all locales
// without truncating the JSON (which would make the whole batch unparseable).
const NEWS_MAX_OUTPUT_TOKENS = 16384;

// Human-readable language names help the model emit the correct language for
// region-tagged codes (e.g. zh-CN, pt-BR, es-ES).
const localeToLanguageName: Record<LocaleType, string> = {
    [LocaleType.EN]: "English",
    [LocaleType.KO]: "Korean",
    [LocaleType.JA]: "Japanese",
    [LocaleType.ES]: "European Spanish",
    [LocaleType.FR]: "French",
    [LocaleType.ZH]: "Simplified Chinese",
    [LocaleType.NL]: "Dutch",
    [LocaleType.ID]: "Indonesian",
    [LocaleType.PT]: "Brazilian Portuguese",
    [LocaleType.RU]: "Russian",
    [LocaleType.DE]: "German",
    [LocaleType.HI]: "Hindi",
};

// Force structured JSON output so a single multi-locale response can be parsed
// deterministically (one entry per requested locale).
const BATCHED_NEWS_SCHEMA: ResponseSchema = {
    type: SchemaType.ARRAY,
    items: {
        type: SchemaType.OBJECT,
        properties: {
            locale: { type: SchemaType.STRING },
            summary: { type: SchemaType.STRING },
        },
        required: ["locale", "summary"],
    },
};

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

const getBatchedNewsPrompt = (
    posts: Array<Object>,
    interval: PromptInterval,
    locales: ReadonlyArray<LocaleType>,
): string => {
    const localeList = locales
        .map((locale) => `${locale} (${localeToLanguageName[locale]})`)
        .join(", ");

    return `You are Kimiqo, a friendly 23 year old K-pop enthusiast who follows the latest updates in K-pop. You are giving an update on the latest happenings in K-pop for a game called KMQ (K-pop Music Quiz). You will be given a string delimited by |, where each column is: the date, the type of post, and the title of the post. The posts are sorted by priority/significance. Make sure to address the message to KMQ fans/players, and mention who you are. Limit each summary to 250 words, even if it means you have to ignore some of the data.

Summarize ${interval} in K-pop in paragraph form (multiple paragraphs if needed), from the POV of an excited and preppy K-pop fan. Add a lot of personality to the summary. Use emojis where appropriate.

Write the summary in every one of these locales: ${localeList}. Return a JSON array with exactly one object per requested locale; set "locale" to the exact locale code from the list and "summary" to the summary written in that locale's language. Data is below:\n${posts.join("\n")}\n`;
};

export default class GeminiClient {
    private client: GenerativeModel;

    constructor() {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
        this.client = genAI.getGenerativeModel({
            model: "gemini-2.5-flash-lite",
        });
    }

    /**
     * Generate news summaries for every requested locale in a single request.
     * Each locale used to cost its own request, which exhausted the
     * requests-per-minute quota while barely touching the token allowance;
     * batching the languages trades many small requests for one large one.
     * Output is forced to JSON (one entry per locale) so it parses reliably.
     * @param newsRange - the time range to summarize
     * @param topPosts - the source posts (shared across locales)
     * @param locales - the locales to produce summaries for
     * @returns a map of locale to summary; locales missing from the model's
     * response are simply absent (callers handle the gaps)
     */
    async getPostSummaries(
        newsRange: NewsRange,
        topPosts: Array<KpopNewsRedditPost>,
        locales: ReadonlyArray<LocaleType>,
    ): Promise<Map<LocaleType, string>> {
        const summaries = new Map<LocaleType, string>();
        if (locales.length === 0) {
            return summaries;
        }

        try {
            const formattedTopPosts = topPosts.map(
                (x) =>
                    `${standardDateFormat(x.date)} | ${x.flair} | ${x.title}`,
            );

            const prompt = getBatchedNewsPrompt(
                formattedTopPosts,
                newsRangeToPromptInterval(newsRange),
                locales,
            );

            const generatedContent = await this.client.generateContent({
                contents: [{ role: "user", parts: [{ text: prompt }] }],
                generationConfig: {
                    responseMimeType: "application/json",
                    responseSchema: BATCHED_NEWS_SCHEMA,
                    maxOutputTokens: NEWS_MAX_OUTPUT_TOKENS,
                },
            });

            const text = generatedContent.response.text();
            if (text === "") {
                throw new Error(
                    `Empty response. newsRange = ${newsRange}. generatedContent = ${JSON.stringify(
                        generatedContent,
                    )}`,
                );
            }

            const parsed = JSON.parse(text) as unknown;
            if (!Array.isArray(parsed)) {
                throw new Error(
                    `Expected a JSON array, got ${typeof parsed}. text = ${text}`,
                );
            }

            const requested = new Set<string>(locales);
            for (const entry of parsed as Array<{
                locale?: unknown;
                summary?: unknown;
            } | null>) {
                if (
                    entry &&
                    typeof entry.locale === "string" &&
                    typeof entry.summary === "string" &&
                    requested.has(entry.locale)
                ) {
                    summaries.set(entry.locale as LocaleType, entry.summary);
                }
            }

            return summaries;
        } catch (e) {
            logger.warn(
                `Failed to fetch getPostSummaries(). newsRange = ${newsRange}. locales = ${locales.join(
                    ",",
                )}. e = ${e}`,
            );
            return summaries;
        }
    }
}
