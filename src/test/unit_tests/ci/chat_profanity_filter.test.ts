import { describe, it } from "mocha";
import assert from "assert";
import maskProfanity from "../../../helpers/chat_profanity_filter";

describe("chat profanity filter", () => {
    describe("allows ordinary profanity untouched", () => {
        const allowed = [
            "what the fuck is this",
            "holy shit that was close",
            "damn, nice guess",
            "this song kicks ass",
            "you son of a bitch, good round",
            "gg wp everyone",
        ];

        for (const text of allowed) {
            it(`leaves "${text}" unchanged`, () => {
                assert.strictEqual(maskProfanity(text), text);
            });
        }
    });

    describe("masks heinous slurs", () => {
        it("masks a slur but keeps the rest of the sentence", () => {
            const out = maskProfanity("you are a nigger lol");
            assert.ok(!out.toLowerCase().includes("nigger"), out);
            assert.ok(out.startsWith("you are a "), out);
            assert.ok(out.endsWith(" lol"), out);
        });

        it("catches leetspeak obfuscation", () => {
            assert.ok(!/n[i1]gg[e3]r/i.test(maskProfanity("n1gg3r")));
            assert.ok(!/f[a4]gg?[o0]t/i.test(maskProfanity("f4ggot")));
        });

        it("catches exaggerated character runs", () => {
            const out = maskProfanity("coooon");
            assert.strictEqual(out, "*".repeat("coooon".length));
        });

        it("masks simple plurals", () => {
            assert.ok(!maskProfanity("faggots").toLowerCase().includes("fag"));
        });

        it("preserves the masked token's length", () => {
            assert.strictEqual(maskProfanity("kike"), "****");
        });
    });

    describe("avoids false positives (Scunthorpe problem)", () => {
        const innocent = [
            "the con artist was suspicious",
            "pros and cons of this strategy",
            "i read a book about raccoons habitat",
            "class in session, pay attention",
        ];

        for (const text of innocent) {
            it(`leaves "${text}" unchanged`, () => {
                assert.strictEqual(maskProfanity(text), text);
            });
        }
    });
});
