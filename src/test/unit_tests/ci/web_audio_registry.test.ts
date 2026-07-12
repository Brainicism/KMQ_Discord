import {
    WEB_AUDIO_TOKEN_TTL_BUFFER_MS,
    specialFfmpegArgs,
} from "../../../constants";
import {
    WebAudioRegistry,
    buildAudioStreamArgs,
    remainingPlaybackSec,
} from "../../../web_audio_registry";
import { describe } from "mocha";
import SpecialType from "../../../enums/option_types/special_type";
import assert from "assert";
import type { WebAudioSpec } from "../../../web_audio_registry";

const GUILD_ID = "4611686018427387905";
const NOW = 1_750_000_000_000;

function spec(overrides: Partial<WebAudioSpec> = {}): WebAudioSpec {
    return {
        songLocation: "/songs/dQw4w9WgXcQ.ogg",
        inputArgs: ["-ss", "30"],
        encoderArgs: [],
        playbackDurationSec: 180,
        ...overrides,
    };
}

describe("web audio registry", () => {
    let registry: WebAudioRegistry;

    beforeEach(() => {
        registry = new WebAudioRegistry();
    });

    describe("mint", () => {
        it("should be retrievable by token until expiry", () => {
            const entry = registry.mint(GUILD_ID, spec(), NOW);
            assert.strictEqual(registry.get(entry.token, NOW), entry);
            assert.strictEqual(
                entry.expiresAt,
                NOW + 180 * 1000 + WEB_AUDIO_TOKEN_TTL_BUFFER_MS,
            );

            assert.strictEqual(
                registry.get(entry.token, entry.expiresAt),
                null,
            );
        });

        it("should replace the guild's previous entry", () => {
            const first = registry.mint(GUILD_ID, spec(), NOW);
            const second = registry.mint(GUILD_ID, spec(), NOW + 1000);
            assert.notStrictEqual(first.token, second.token);
            assert.strictEqual(registry.get(first.token, NOW + 1000), null);
            assert.strictEqual(registry.size(), 1);
            assert.strictEqual(
                registry.currentForGuild(GUILD_ID, NOW + 1000),
                second,
            );
        });
    });

    describe("currentForGuild", () => {
        it("should return null once playback has (nearly) ended", () => {
            registry.mint(GUILD_ID, spec({ playbackDurationSec: 20 }), NOW);
            assert.ok(registry.currentForGuild(GUILD_ID, NOW + 19_000));
            assert.strictEqual(
                registry.currentForGuild(GUILD_ID, NOW + 19_600),
                null,
            );
        });
    });

    describe("clearGuild", () => {
        it("should drop the token too", () => {
            const entry = registry.mint(GUILD_ID, spec(), NOW);
            registry.clearGuild(GUILD_ID);
            assert.strictEqual(registry.get(entry.token, NOW), null);
            assert.strictEqual(registry.size(), 0);
        });
    });

    describe("sweep", () => {
        it("should evict only expired entries", () => {
            const shortLived = registry.mint(
                "1",
                spec({ playbackDurationSec: 10 }),
                NOW,
            );

            const longLived = registry.mint(
                "2",
                spec({ playbackDurationSec: 600 }),
                NOW,
            );

            registry.sweep(NOW + 10 * 1000 + WEB_AUDIO_TOKEN_TTL_BUFFER_MS);
            assert.strictEqual(registry.size(), 1);
            assert.strictEqual(
                registry.get(
                    shortLived.token,
                    NOW + 10 * 1000 + WEB_AUDIO_TOKEN_TTL_BUFFER_MS,
                ),
                null,
            );

            assert.ok(
                registry.get(
                    longLived.token,
                    NOW + 10 * 1000 + WEB_AUDIO_TOKEN_TTL_BUFFER_MS,
                ),
            );
        });
    });
});

describe("buildAudioStreamArgs", () => {
    const registry = new WebAudioRegistry();

    it("should preserve the original input seek and add a bounding -t", () => {
        const entry = registry.mint(GUILD_ID, spec(), NOW);
        const args = buildAudioStreamArgs(entry, NOW)!;
        assert.deepStrictEqual(args.slice(0, 7), [
            "-hide_banner",
            "-loglevel",
            "error",
            "-ss",
            "30",
            "-i",
            "/songs/dQw4w9WgXcQ.ogg",
        ]);

        // At t=0 there's no catch-up seek, just the duration bound.
        assert.deepStrictEqual(args.slice(7), [
            "-t",
            "180.000",
            "-vn",
            "-map_metadata",
            "-1",
            "-c:a",
            "libmp3lame",
            "-b:a",
            "128k",
            "-f",
            "mp3",
            "pipe:1",
        ]);
    });

    it("should seek output-side by wall-clock elapsed for late joiners", () => {
        const entry = registry.mint(GUILD_ID, spec(), NOW);
        const args = buildAudioStreamArgs(entry, NOW + 42_500)!;

        // Output -ss comes after -i: it trims the *filtered* stream, which is
        // in wall time for every special mode (tempo changes, reverse).
        const iIndex = args.indexOf("-i");
        const ssIndex = args.lastIndexOf("-ss");
        assert.ok(ssIndex > iIndex);
        assert.strictEqual(args[ssIndex + 1], "42.500");

        // Remaining duration shrinks by the elapsed time.
        const tIndex = args.indexOf("-t");
        assert.strictEqual(args[tIndex + 1], "137.500");
    });

    it("should skip the output seek for near-zero elapsed", () => {
        const entry = registry.mint(GUILD_ID, spec(), NOW);
        const args = buildAudioStreamArgs(entry, NOW + 200)!;
        assert.strictEqual(args.lastIndexOf("-ss"), args.indexOf("-ss"));
    });

    it("should rewrite an existing clip -t to the remaining duration", () => {
        const entry = registry.mint(
            GUILD_ID,
            spec({
                encoderArgs: ["-t", "20"],
                playbackDurationSec: 20,
            }),
            NOW,
        );

        const args = buildAudioStreamArgs(entry, NOW + 5_000)!;
        const tIndex = args.indexOf("-t");
        assert.strictEqual(args[tIndex + 1], "15.000");
        assert.strictEqual(args.indexOf("-t", tIndex + 2), -1);
    });

    it("should keep special-mode filters intact (REVERSE)", () => {
        // Matches WebGameSession's emit: specialFfmpegArgs' encoderArgs are
        // flattened with filter chains joined by commas.
        const reverse = specialFfmpegArgs[SpecialType.REVERSE](30, 210);
        const entry = registry.mint(
            GUILD_ID,
            spec({
                inputArgs: reverse.inputArgs,
                encoderArgs: Object.entries(reverse.encoderArgs).flatMap(
                    (x) => [x[0], x[1].join(",")],
                ),
                playbackDurationSec: 180,
            }),
            NOW,
        );

        const args = buildAudioStreamArgs(entry, NOW + 10_000)!;
        const afIndex = args.indexOf("-af");
        assert.strictEqual(args[afIndex + 1], "atrim=end=180,areverse");

        // REVERSE has no input seek; the only -ss is the output-side one.
        assert.strictEqual(args.indexOf("-ss"), args.lastIndexOf("-ss"));
        assert.ok(args.indexOf("-ss") > args.indexOf("-i"));
        assert.strictEqual(args[args.indexOf("-ss") + 1], "10.000");
    });

    it("should return null when playback has ended", () => {
        const entry = registry.mint(
            GUILD_ID,
            spec({ playbackDurationSec: 20 }),
            NOW,
        );

        assert.strictEqual(buildAudioStreamArgs(entry, NOW + 19_700), null);
    });
});

describe("remainingPlaybackSec", () => {
    it("should measure from mint time", () => {
        const registry = new WebAudioRegistry();
        const entry = registry.mint(
            GUILD_ID,
            spec({ playbackDurationSec: 60 }),
            NOW,
        );

        assert.strictEqual(remainingPlaybackSec(entry, NOW + 15_000), 45);
    });
});
