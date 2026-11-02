import {
    AUTOMATIC_ACHIEVEMENTS,
    buildProfileBadges,
} from "../../../structures/achievements";
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

    describe("hints", () => {
        const statForHint = {
            firstGame: "gamesPlayed",
            gamesPlayed: "gamesPlayed",
            songsGuessed: "songsGuessed",
            playStreak: "longestPlayStreak",
        } as const;

        it("should match each achievement's real unlock threshold", () => {
            for (const a of AUTOMATIC_ACHIEVEMENTS) {
                if (a.hint.key === "win") {
                    assert.ok(a.earned({ ...BASE_CONTEXT, wonGame: true }));
                    assert.ok(!a.earned(BASE_CONTEXT));
                    continue;
                }

                const stat = statForHint[a.hint.key];
                const count = a.hint.count ?? 1;
                assert.ok(
                    a.earned({ ...BASE_CONTEXT, [stat]: count }),
                    `${a.name} should unlock at ${count}`,
                );

                assert.ok(
                    !a.earned({ ...BASE_CONTEXT, [stat]: count - 1 }),
                    `${a.name} should not unlock below ${count}`,
                );
            }
        });
    });

    describe("buildProfileBadges", () => {
        const stats = {
            gamesPlayed: 150,
            songsGuessed: 742,
            longestPlayStreak: 3,
        };

        it("lists owned badges first, then locked ones easiest first", () => {
            const badges = buildProfileBadges(
                [
                    { id: 1003, name: "🕹️ Centurion" },
                    { id: 7, name: "Beta Tester" },
                ],
                stats,
            );

            assert.deepStrictEqual(
                badges.slice(0, 2).map((b) => [b.name, b.earned]),
                [
                    ["🕹️ Centurion", true],
                    ["Beta Tester", true],
                ],
            );

            const locked = badges.slice(2);
            assert.ok(locked.every((b) => !b.earned));
            assert.strictEqual(
                locked.length,
                AUTOMATIC_ACHIEVEMENTS.length - 1,
            );
            assert.strictEqual(locked[0]!.name, "🎮 First Game");
        });

        it("gives manual badges no hint and owned badges no progress", () => {
            const [manual, owned] = buildProfileBadges(
                [
                    { id: 7, name: "Beta Tester" },
                    { id: 1005, name: "🎵 Melophile" },
                ],
                stats,
            );

            assert.strictEqual(manual!.hint, null);
            assert.deepStrictEqual(owned!.hint, {
                key: "songsGuessed",
                count: 1000,
            });
            assert.strictEqual(owned!.progress, null);
        });

        it("reports clamped progress toward locked thresholds", () => {
            const byName = new Map(
                buildProfileBadges([], stats).map((b) => [b.name, b]),
            );

            assert.deepStrictEqual(byName.get("🎵 Melophile")!.progress, {
                current: 742,
                target: 1000,
            });

            assert.deepStrictEqual(byName.get("🕹️ Centurion")!.progress, {
                current: 100,
                target: 100,
            });
            assert.strictEqual(byName.get("🏆 First Victory")!.progress, null);
        });
    });
});
