import { describe, it } from "mocha";
import assert from "assert";
import maskProfanity, {
    isFiltered,
} from "../../../helpers/chat_profanity_filter";
import wordListJson from "@dsojevic/profanity-list/en.json";
import type { WordListEntry } from "../../../helpers/chat_profanity_filter";

const wordList = wordListJson as WordListEntry[];

// Fixtures are taken from the package data at runtime rather than written out
// here. Only the first `match` variant of an entry is used, with the repeat
// markers stripped the same way the filter strips them.
const sampleOf = (entry: { match: string }): string =>
    entry.match.split("|")[0]!.replace(/\*/g, "");

const filteredSamples = wordList
    .filter(isFiltered)
    .map(sampleOf)
    .filter((term) => term.length > 0);

const permittedSamples = wordList
    .filter((entry) => !isFiltered(entry))
    .map(sampleOf)
    .filter((term) => term.length > 0);

describe("chat profanity filter", () => {
    describe("policy", () => {
        it("filters a non-trivial slice of the word list", () => {
            assert.ok(
                filteredSamples.length > 50,
                `only ${filteredSamples.length} entries filtered`,
            );
        });

        it("permits the large majority of the word list", () => {
            assert.ok(permittedSamples.length > filteredSamples.length);
        });
    });

    describe("permitted terms", () => {
        it("leaves the vast majority of permitted terms unmasked", () => {
            const masked = permittedSamples.filter(
                (term) => maskProfanity(term) !== term,
            );

            // A few permitted terms legitimately contain a filtered term as a
            // substring, so they still mask. Everything else must pass.
            const ratio = masked.length / permittedSamples.length;
            assert.ok(
                ratio < 0.05,
                `${masked.length}/${permittedSamples.length} permitted terms were masked`,
            );
        });
    });

    describe("filtered terms", () => {
        it("masks every filtered term", () => {
            for (const term of filteredSamples) {
                const masked = maskProfanity(term);
                assert.notStrictEqual(masked, term, "expected a mask");
                assert.ok(masked.includes("*"), "expected asterisk masking");
            }
        });

        it("keeps the surrounding sentence intact", () => {
            const term = filteredSamples[0]!;
            const masked = maskProfanity(`hey ${term} lol`);
            assert.ok(masked.startsWith("hey "), masked);
            assert.ok(masked.endsWith(" lol"), masked);
            assert.ok(!masked.includes(term), "term leaked through the mask");
        });

        it("catches character substitution", () => {
            const substitutions: Record<string, string> = {
                a: "4",
                e: "3",
                i: "1",
                o: "0",
            };

            const disguisable = filteredSamples.filter((term) =>
                [...term].some((ch) => ch in substitutions),
            );

            assert.ok(disguisable.length > 0);
            const missed = disguisable.filter((term) => {
                const disguised = [...term]
                    .map((ch) => substitutions[ch] ?? ch)
                    .join("");

                return maskProfanity(disguised) === disguised;
            });

            assert.strictEqual(
                missed.length,
                0,
                `${missed.length}/${disguisable.length} disguised variants slipped through`,
            );
        });
    });

    describe("leaves ordinary chat alone", () => {
        // Plain messages, including ones whose innocent substrings trip naive
        // matchers.
        const innocent = [
            "great song, nice guess everyone",
            "the class assassin was suspicious",
            "pros and cons of this strategy",
            "i read a book about their habitat",
            "documentation for the analysis",
            "gg wp, that chorus was unreal",
        ];

        for (const text of innocent) {
            it(`leaves "${text}" unchanged`, () => {
                assert.strictEqual(maskProfanity(text), text);
            });
        }
    });
});
