import { parseSetOptionBody } from "../../../kmq_web_server";
import AnswerType from "../../../enums/option_types/answer_type";
import ArtistType from "../../../enums/option_types/artist_type";
import GuessModeType from "../../../enums/option_types/guess_mode_type";
import LanguageType from "../../../enums/option_types/language_type";
import MultiGuessType from "../../../enums/option_types/multiguess_type";
import OstPreference from "../../../enums/option_types/ost_preference";
import ReleaseType from "../../../enums/option_types/release_type";
import SeekType from "../../../enums/option_types/seek_type";
import ShuffleType from "../../../enums/option_types/shuffle_type";
import SpecialType from "../../../enums/option_types/special_type";
import SubunitsPreference from "../../../enums/option_types/subunit_preference";
import assert from "assert";

/**
 * `parseSetOptionBody` is the server-side whitelist for POST /api/activity/option.
 * It must never trust the client: only the typed value for the declared `kind`
 * is accepted, every enum is checked against its set, numbers are range-clamped,
 * and arrays are length-capped. These tests pin that contract for the full
 * option matrix the Activity exposes.
 */
describe("parseSetOptionBody", () => {
    describe("malformed envelopes", () => {
        it("rejects non-objects", () => {
            assert.strictEqual(parseSetOptionBody(null), null);
            assert.strictEqual(parseSetOptionBody(undefined), null);
            assert.strictEqual(parseSetOptionBody("gender"), null);
            assert.strictEqual(parseSetOptionBody(42), null);
        });

        it("rejects an unknown kind", () => {
            assert.strictEqual(parseSetOptionBody({ kind: "nonsense" }), null);
            // Missing kind entirely.
            assert.strictEqual(parseSetOptionBody({ genders: [] }), null);
        });
    });

    describe("gender", () => {
        it("accepts a valid subset", () => {
            assert.deepStrictEqual(
                parseSetOptionBody({ kind: "gender", genders: ["male"] }),
                { kind: "gender", genders: ["male"] },
            );
        });

        it("accepts the full set", () => {
            const genders = ["male", "female", "coed", "alternating"];
            assert.deepStrictEqual(
                parseSetOptionBody({ kind: "gender", genders }),
                { kind: "gender", genders },
            );
        });

        it("rejects an unknown gender value", () => {
            assert.strictEqual(
                parseSetOptionBody({ kind: "gender", genders: ["robot"] }),
                null,
            );
        });

        it("rejects a non-array genders payload", () => {
            assert.strictEqual(
                parseSetOptionBody({ kind: "gender", genders: "male" }),
                null,
            );
        });

        it("rejects more than four entries", () => {
            assert.strictEqual(
                parseSetOptionBody({
                    kind: "gender",
                    genders: ["male", "female", "coed", "alternating", "male"],
                }),
                null,
            );
        });

        it("rejects a non-string entry", () => {
            assert.strictEqual(
                parseSetOptionBody({ kind: "gender", genders: [1] }),
                null,
            );
        });
    });

    describe("enum options", () => {
        // [kind, valueKey, validValue, invalidValue]
        const cases: Array<[string, string, string, string]> = [
            ["guessMode", "guessMode", GuessModeType.BOTH, "telepathy"],
            ["multiguess", "multiguess", MultiGuessType.ON, "maybe"],
            ["shuffle", "shuffle", ShuffleType.RANDOM, "spiral"],
            ["seek", "seek", SeekType.BEGINNING, "sideways"],
            ["language", "language", LanguageType.ALL, "klingon"],
            ["release", "release", ReleaseType.OFFICIAL, "leaked"],
            ["artisttype", "artisttype", ArtistType.SOLOIST, "android"],
            ["subunits", "subunits", SubunitsPreference.INCLUDE, "sometimes"],
            ["answer", "answer", AnswerType.MULTIPLE_CHOICE_EASY, "telepathy"],
            ["ost", "ost", OstPreference.EXCLUSIVE, "soundtrackish"],
        ];

        for (const [kind, key, valid, invalid] of cases) {
            it(`accepts a valid ${kind}`, () => {
                assert.deepStrictEqual(
                    parseSetOptionBody({ kind, [key]: valid }),
                    { kind, [key]: valid },
                );
            });

            it(`rejects an out-of-set ${kind}`, () => {
                assert.strictEqual(
                    parseSetOptionBody({ kind, [key]: invalid }),
                    null,
                );
            });

            it(`rejects a non-string ${kind}`, () => {
                assert.strictEqual(
                    parseSetOptionBody({ kind, [key]: 5 }),
                    null,
                );
            });
        }
    });

    describe("special (nullable enum)", () => {
        it("accepts a valid modifier", () => {
            assert.deepStrictEqual(
                parseSetOptionBody({
                    kind: "special",
                    special: SpecialType.REVERSE,
                }),
                { kind: "special", special: SpecialType.REVERSE },
            );
        });

        it("accepts null (clears the modifier)", () => {
            assert.deepStrictEqual(
                parseSetOptionBody({ kind: "special", special: null }),
                { kind: "special", special: null },
            );
        });

        it("rejects an unknown modifier", () => {
            assert.strictEqual(
                parseSetOptionBody({ kind: "special", special: "echo" }),
                null,
            );
        });
    });

    describe("limit (paired ints)", () => {
        it("accepts a valid ascending range", () => {
            assert.deepStrictEqual(
                parseSetOptionBody({
                    kind: "limit",
                    limitStart: 0,
                    limitEnd: 100,
                }),
                { kind: "limit", limitStart: 0, limitEnd: 100 },
            );
        });

        it("rejects start >= end", () => {
            assert.strictEqual(
                parseSetOptionBody({
                    kind: "limit",
                    limitStart: 100,
                    limitEnd: 100,
                }),
                null,
            );
        });

        it("rejects an out-of-range bound", () => {
            assert.strictEqual(
                parseSetOptionBody({
                    kind: "limit",
                    limitStart: 0,
                    limitEnd: 100_001,
                }),
                null,
            );
        });

        it("rejects a non-integer bound", () => {
            assert.strictEqual(
                parseSetOptionBody({
                    kind: "limit",
                    limitStart: 0,
                    limitEnd: 50.5,
                }),
                null,
            );
        });
    });

    describe("cutoff (year range)", () => {
        const now = new Date().getFullYear();

        it("accepts a valid range", () => {
            assert.deepStrictEqual(
                parseSetOptionBody({
                    kind: "cutoff",
                    beginningYear: 2000,
                    endYear: now,
                }),
                { kind: "cutoff", beginningYear: 2000, endYear: now },
            );
        });

        it("rejects begin > end", () => {
            assert.strictEqual(
                parseSetOptionBody({
                    kind: "cutoff",
                    beginningYear: 2010,
                    endYear: 2000,
                }),
                null,
            );
        });

        it("rejects a year before the earliest searchable year", () => {
            assert.strictEqual(
                parseSetOptionBody({
                    kind: "cutoff",
                    beginningYear: 1899,
                    endYear: now,
                }),
                null,
            );
        });

        it("rejects a future end year", () => {
            assert.strictEqual(
                parseSetOptionBody({
                    kind: "cutoff",
                    beginningYear: 2000,
                    endYear: now + 1,
                }),
                null,
            );
        });
    });

    describe("nullable scalar options", () => {
        // [kind, key, validValue, tooLow, tooHigh]
        const cases: Array<[string, string, number, number, number]> = [
            ["goal", "goal", 50, 0, 100_001],
            ["timer", "timer", 30, 1, 181],
            ["duration", "duration", 120, 1, 601],
        ];

        for (const [kind, key, valid, tooLow, tooHigh] of cases) {
            it(`accepts a valid ${kind}`, () => {
                assert.deepStrictEqual(
                    parseSetOptionBody({ kind, [key]: valid }),
                    { kind, [key]: valid },
                );
            });

            it(`accepts null ${kind} (resets it)`, () => {
                assert.deepStrictEqual(
                    parseSetOptionBody({ kind, [key]: null }),
                    { kind, [key]: null },
                );
            });

            it(`rejects a below-range ${kind}`, () => {
                assert.strictEqual(
                    parseSetOptionBody({ kind, [key]: tooLow }),
                    null,
                );
            });

            it(`rejects an above-range ${kind}`, () => {
                assert.strictEqual(
                    parseSetOptionBody({ kind, [key]: tooHigh }),
                    null,
                );
            });
        }
    });

    describe("artist lists", () => {
        for (const kind of ["groups", "includes", "excludes"]) {
            it(`accepts a valid ${kind} list`, () => {
                assert.deepStrictEqual(
                    parseSetOptionBody({ kind, artistIDs: [1, 2, 3] }),
                    { kind, artistIDs: [1, 2, 3] },
                );
            });

            it(`accepts an empty ${kind} list`, () => {
                assert.deepStrictEqual(
                    parseSetOptionBody({ kind, artistIDs: [] }),
                    { kind, artistIDs: [] },
                );
            });

            it(`rejects a non-positive id in ${kind}`, () => {
                assert.strictEqual(
                    parseSetOptionBody({ kind, artistIDs: [1, 0] }),
                    null,
                );
            });

            it(`rejects a non-integer id in ${kind}`, () => {
                assert.strictEqual(
                    parseSetOptionBody({ kind, artistIDs: [1.5] }),
                    null,
                );
            });

            it(`rejects more than 200 ids in ${kind}`, () => {
                const artistIDs = Array.from({ length: 201 }, (_, i) => i + 1);
                assert.strictEqual(
                    parseSetOptionBody({ kind, artistIDs }),
                    null,
                );
            });

            it(`rejects a non-array ${kind} payload`, () => {
                assert.strictEqual(
                    parseSetOptionBody({ kind, artistIDs: 5 }),
                    null,
                );
            });
        }
    });

    describe("playlist", () => {
        it("accepts a URL string", () => {
            assert.deepStrictEqual(
                parseSetOptionBody({
                    kind: "playlist",
                    playlistURL: "https://open.spotify.com/playlist/abc",
                }),
                {
                    kind: "playlist",
                    playlistURL: "https://open.spotify.com/playlist/abc",
                },
            );
        });

        it("accepts null (clears the playlist)", () => {
            assert.deepStrictEqual(
                parseSetOptionBody({ kind: "playlist", playlistURL: null }),
                { kind: "playlist", playlistURL: null },
            );
        });

        it("rejects an over-long URL", () => {
            assert.strictEqual(
                parseSetOptionBody({
                    kind: "playlist",
                    playlistURL: "x".repeat(2049),
                }),
                null,
            );
        });

        it("rejects a non-string URL", () => {
            assert.strictEqual(
                parseSetOptionBody({ kind: "playlist", playlistURL: 5 }),
                null,
            );
        });
    });

    describe("reset", () => {
        it("accepts a bare reset", () => {
            assert.deepStrictEqual(parseSetOptionBody({ kind: "reset" }), {
                kind: "reset",
            });
        });
    });
});
