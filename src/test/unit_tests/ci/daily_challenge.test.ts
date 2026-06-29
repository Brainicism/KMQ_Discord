import {
    dailySeedFromDate,
    getDailyChallengeDate,
    mulberry32,
    seededShuffle,
} from "../../../helpers/daily_challenge";
import assert from "assert";

describe("daily challenge determinism", () => {
    describe("getDailyChallengeDate", () => {
        it("formats the UTC date as YYYY-MM-DD", () => {
            const date = getDailyChallengeDate(
                new Date("2026-06-28T23:30:00.000Z"),
            );

            assert.strictEqual(date, "2026-06-28");
        });

        it("is stable across times within the same UTC day", () => {
            const a = getDailyChallengeDate(
                new Date("2026-06-28T00:00:00.000Z"),
            );

            const b = getDailyChallengeDate(
                new Date("2026-06-28T23:59:59.000Z"),
            );

            assert.strictEqual(a, b);
        });
    });

    describe("dailySeedFromDate", () => {
        it("is deterministic for the same date", () => {
            assert.strictEqual(
                dailySeedFromDate("2026-06-28"),
                dailySeedFromDate("2026-06-28"),
            );
        });

        it("differs across dates", () => {
            assert.notStrictEqual(
                dailySeedFromDate("2026-06-28"),
                dailySeedFromDate("2026-06-29"),
            );
        });

        it("returns an unsigned 32-bit integer", () => {
            const seed = dailySeedFromDate("2026-06-28");
            assert.ok(Number.isInteger(seed));
            assert.ok(seed >= 0 && seed <= 0xffffffff);
        });
    });

    describe("mulberry32", () => {
        it("produces the same sequence for the same seed", () => {
            const a = mulberry32(12345);
            const b = mulberry32(12345);
            const seqA = [a(), a(), a(), a()];
            const seqB = [b(), b(), b(), b()];
            assert.deepStrictEqual(seqA, seqB);
        });

        it("produces values in [0, 1)", () => {
            const rng = mulberry32(99);
            for (let i = 0; i < 100; i++) {
                const v = rng();
                assert.ok(v >= 0 && v < 1);
            }
        });

        it("produces different sequences for different seeds", () => {
            const a = mulberry32(1);
            const b = mulberry32(2);
            assert.notStrictEqual(a(), b());
        });
    });

    describe("seededShuffle", () => {
        const items = Array.from({ length: 50 }, (_, i) => i);

        it("is deterministic for the same seed", () => {
            const a = seededShuffle(items, mulberry32(7));
            const b = seededShuffle(items, mulberry32(7));
            assert.deepStrictEqual(a, b);
        });

        it("differs for different seeds", () => {
            const a = seededShuffle(items, mulberry32(7));
            const b = seededShuffle(items, mulberry32(8));
            assert.notDeepStrictEqual(a, b);
        });

        it("is a permutation (no loss or duplication)", () => {
            const shuffled = seededShuffle(items, mulberry32(7));
            assert.deepStrictEqual(
                [...shuffled].sort((x, y) => x - y),
                items,
            );
        });

        it("does not mutate the input", () => {
            const input = [1, 2, 3, 4, 5];
            const copy = [...input];
            seededShuffle(input, mulberry32(3));
            assert.deepStrictEqual(input, copy);
        });

        it("same date seed ⇒ same order (end-to-end determinism)", () => {
            const date = "2026-06-28";
            const a = seededShuffle(items, mulberry32(dailySeedFromDate(date)));
            const b = seededShuffle(items, mulberry32(dailySeedFromDate(date)));
            assert.deepStrictEqual(a, b);
        });
    });
});
