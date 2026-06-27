import { AUTOMATIC_ACHIEVEMENTS } from "../../../structures/achievements";
import assert from "assert";
import type { AchievementContext } from "../../../structures/achievements";

const BASE_CONTEXT: AchievementContext = {
    gamesPlayed: 0,
    songsGuessed: 0,
    level: 0,
    longestPlayStreak: 0,
    wonGame: false,
};

function earnedNames(overrides: Partial<AchievementContext>): string[] {
    const ctx = { ...BASE_CONTEXT, ...overrides };
    return AUTOMATIC_ACHIEVEMENTS.filter((a) => a.earned(ctx)).map(
        (a) => a.name,
    );
}

describe("automatic achievements", () => {
    describe("badge definitions", () => {
        it("should have unique badge ids", () => {
            const ids = AUTOMATIC_ACHIEVEMENTS.map((a) => a.badgeId);
            assert.strictEqual(new Set(ids).size, ids.length);
        });

        it("should reserve ids at/above 1000 to avoid manual-badge collisions", () => {
            assert.ok(AUTOMATIC_ACHIEVEMENTS.every((a) => a.badgeId >= 1000));
        });
    });

    describe("threshold evaluation", () => {
        it("should award nothing for a player who has not played", () => {
            assert.deepStrictEqual(earnedNames({}), []);
        });

        it("should award First Game after a single game", () => {
            assert.deepStrictEqual(earnedNames({ gamesPlayed: 1 }), [
                "🎮 First Game",
            ]);
        });

        it("should award First Victory only when the player won", () => {
            assert.ok(
                !earnedNames({ gamesPlayed: 1 }).includes("🏆 First Victory"),
            );

            assert.ok(
                earnedNames({ gamesPlayed: 1, wonGame: true }).includes(
                    "🏆 First Victory",
                ),
            );
        });

        it("should stack the songs-guessed milestones as the count climbs", () => {
            assert.ok(
                !earnedNames({ songsGuessed: 99 }).includes("💯 Century Club"),
            );

            assert.ok(
                earnedNames({ songsGuessed: 100 }).includes("💯 Century Club"),
            );

            const at1000 = earnedNames({ songsGuessed: 1000 });
            assert.ok(at1000.includes("💯 Century Club"));
            assert.ok(at1000.includes("🎵 Melophile"));
            assert.ok(!at1000.includes("🎧 Living Encyclopedia"));

            const at10000 = earnedNames({ songsGuessed: 10000 });
            assert.ok(at10000.includes("🎧 Living Encyclopedia"));
        });

        it("should award the games-played milestone at 100 games", () => {
            assert.ok(
                !earnedNames({ gamesPlayed: 99 }).includes("🕹️ Centurion"),
            );

            assert.ok(
                earnedNames({ gamesPlayed: 100 }).includes("🕹️ Centurion"),
            );
        });

        it("should award streak milestones based on the longest streak", () => {
            assert.ok(
                !earnedNames({ longestPlayStreak: 6 }).includes(
                    "🔥 Week Warrior",
                ),
            );

            assert.ok(
                earnedNames({ longestPlayStreak: 7 }).includes(
                    "🔥 Week Warrior",
                ),
            );

            const at30 = earnedNames({ longestPlayStreak: 30 });
            assert.ok(at30.includes("🔥 Week Warrior"));
            assert.ok(at30.includes("🌟 Monthly Devotion"));
        });
    });
});
