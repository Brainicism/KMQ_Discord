/**
 * Automatic achievements. Unlike the manually-administered badges awarded via
 * `scripts/award-badges.ts`, these are granted automatically at the end of a
 * game session (in either the legacy text game or the Activity) when a player
 * crosses the threshold.
 *
 * Each achievement maps to a row in the `badges` table seeded by the
 * play-streak/achievements migration. `badgeId`s start at 1000 to stay clear of
 * the low, manually-assigned ids used for existing badges. The display `name`
 * is raw (not localized) to match how existing badges render on the profile.
 */

export interface AchievementContext {
    /** Cumulative games played, after this session is committed. */
    gamesPlayed: number;
    /** Cumulative songs guessed, after this session is committed. */
    songsGuessed: number;
    /** Player level, after this session's EXP is committed. */
    level: number;
    /** Best consecutive-days-played streak ever reached. */
    longestPlayStreak: number;
    /** Whether the player won (sole/shared first place) this session. */
    wonGame: boolean;
}

interface AchievementDefinition {
    /** Stable badge id; also the `badges.id` seeded by the migration. */
    badgeId: number;
    /** Display name shown on the profile (raw, not localized). */
    name: string;
    /** Higher shows first on the profile (badges are ordered by priority desc). */
    priority: number;
    /** True when the player qualifies for this achievement. */
    earned: (ctx: AchievementContext) => boolean;
}

export const AUTOMATIC_ACHIEVEMENTS: ReadonlyArray<AchievementDefinition> = [
    {
        badgeId: 1000,
        name: "🎮 First Game",
        priority: 1,
        earned: (c) => c.gamesPlayed >= 1,
    },
    {
        badgeId: 1001,
        name: "🏆 First Victory",
        priority: 5,
        earned: (c) => c.wonGame,
    },
    {
        badgeId: 1002,
        name: "💯 Century Club",
        priority: 8,
        earned: (c) => c.songsGuessed >= 100,
    },
    {
        badgeId: 1003,
        name: "🕹️ Centurion",
        priority: 10,
        earned: (c) => c.gamesPlayed >= 100,
    },
    {
        badgeId: 1004,
        name: "🔥 Week Warrior",
        priority: 12,
        earned: (c) => c.longestPlayStreak >= 7,
    },
    {
        badgeId: 1005,
        name: "🎵 Melophile",
        priority: 15,
        earned: (c) => c.songsGuessed >= 1000,
    },
    {
        badgeId: 1006,
        name: "🌟 Monthly Devotion",
        priority: 25,
        earned: (c) => c.longestPlayStreak >= 30,
    },
    {
        badgeId: 1007,
        name: "🎧 Living Encyclopedia",
        priority: 30,
        earned: (c) => c.songsGuessed >= 10000,
    },
];

export interface UnlockedAchievement {
    badgeId: number;
    name: string;
}

/** A player and the achievements they unlocked in a single session. */
export interface PlayerAchievementUnlocks {
    userID: string;
    achievements: UnlockedAchievement[];
}
