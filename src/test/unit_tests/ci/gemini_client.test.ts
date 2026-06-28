import GeminiClient from "../../../helpers/gemini_client";
import LocaleType from "../../../enums/locale_type";
import NewsRange from "../../../enums/news_range";
import assert from "assert";
import sinon from "sinon";
import type { KpopNewsRedditPost } from "../../../helpers/reddit_client";

const topPosts: Array<KpopNewsRedditPost> = [
    { date: new Date("2026-06-01"), flair: "Comeback", title: "A new MV" },
] as unknown as Array<KpopNewsRedditPost>;

/**
 * Stub the underlying Gemini model so getPostSummaries() can be exercised
 * without a network call.
 * @param client - the GeminiClient whose model should be stubbed
 * @param text - the raw response text the stubbed model returns
 * @returns the sinon stub standing in for generateContent
 */
function stubGenerate(client: GeminiClient, text: string): sinon.SinonStub {
    return sinon
        .stub((client as any).client, "generateContent")
        .resolves({ response: { text: () => text } });
}

describe("GeminiClient.getPostSummaries", () => {
    let client: GeminiClient;

    before(() => {
        process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? "test-key";
    });

    beforeEach(() => {
        client = new GeminiClient();
    });

    afterEach(() => {
        sinon.restore();
    });

    it("returns one entry per requested locale from a JSON array", async () => {
        const longSummary = "x".repeat(400);
        stubGenerate(
            client,
            JSON.stringify([
                { locale: LocaleType.EN, summary: longSummary },
                { locale: LocaleType.KO, summary: longSummary },
            ]),
        );

        const summaries = await client.getPostSummaries(
            NewsRange.DAILY,
            topPosts,
            [LocaleType.EN, LocaleType.KO],
        );

        assert.strictEqual(summaries.size, 2);
        assert.strictEqual(summaries.get(LocaleType.EN), longSummary);
        assert.strictEqual(summaries.get(LocaleType.KO), longSummary);
    });

    it("ignores unrequested locales and malformed entries", async () => {
        stubGenerate(
            client,
            JSON.stringify([
                { locale: LocaleType.EN, summary: "valid" },
                { locale: LocaleType.JA, summary: "not requested" },
                null,
                { locale: LocaleType.KO },
                { summary: "no locale" },
                { locale: LocaleType.KO, summary: 123 },
            ]),
        );

        const summaries = await client.getPostSummaries(
            NewsRange.WEEKLY,
            topPosts,
            [LocaleType.EN, LocaleType.KO],
        );

        assert.deepStrictEqual([...summaries.keys()], [LocaleType.EN]);
        assert.strictEqual(summaries.get(LocaleType.EN), "valid");
    });

    it("returns an empty map (no throw) on non-array JSON", async () => {
        stubGenerate(client, JSON.stringify({ not: "an array" }));

        const summaries = await client.getPostSummaries(
            NewsRange.MONTHLY,
            topPosts,
            [LocaleType.EN],
        );

        assert.strictEqual(summaries.size, 0);
    });

    it("returns an empty map (no throw) on invalid JSON", async () => {
        stubGenerate(client, "this is not json");

        const summaries = await client.getPostSummaries(
            NewsRange.DAILY,
            topPosts,
            [LocaleType.EN],
        );

        assert.strictEqual(summaries.size, 0);
    });

    it("makes no request when no locales are requested", async () => {
        const stub = stubGenerate(client, "[]");

        const summaries = await client.getPostSummaries(
            NewsRange.DAILY,
            topPosts,
            [],
        );

        assert.strictEqual(summaries.size, 0);
        assert.ok(stub.notCalled);
    });

    it("requests JSON output with the batched schema", async () => {
        const stub = stubGenerate(
            client,
            JSON.stringify([
                { locale: LocaleType.EN, summary: "x".repeat(400) },
            ]),
        );

        await client.getPostSummaries(NewsRange.DAILY, topPosts, [
            LocaleType.EN,
        ]);

        const request = stub.firstCall.args[0] as {
            generationConfig?: { responseMimeType?: string };
        };

        assert.strictEqual(
            request.generationConfig?.responseMimeType,
            "application/json",
        );
    });
});
