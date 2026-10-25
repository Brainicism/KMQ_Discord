import { AUTOMATIC_ACHIEVEMENTS } from "../structures/achievements";
import dbContext from "../database_context";
import type {
    AchievementContext,
    UnlockedAchievement,
} from "../structures/achievements";

/**
 * Awards any newly-earned automatic achievements to a player and returns the
 * ones unlocked by this call (so the caller can announce them). Idempotent:
 * achievements the player already holds are filtered out, and the insert
 * ignores duplicates on the badges_players primary key.
 * @param userID - the player's Discord user ID
 * @param ctx - the player's post-session stats used to evaluate thresholds
 * @returns the achievements newly unlocked this call (empty if none)
 */
export default async function evaluateAndAwardAchievements(
    userID: string,
    ctx: AchievementContext,
): Promise<UnlockedAchievement[]> {
    const earned = AUTOMATIC_ACHIEVEMENTS.filter((a) => a.earned(ctx));
    if (earned.length === 0) {
        return [];
    }

    const owned = new Set(
        (
            await dbContext.kmq
                .selectFrom("badges_players")
                .select("badge_id")
                .where("user_id", "=", userID)
                .where(
                    "badge_id",
                    "in",
                    earned.map((a) => a.badgeId),
                )
                .execute()
        ).map((r) => r["badge_id"]),
    );

    const toAward = earned.filter((a) => !owned.has(a.badgeId));
    if (toAward.length === 0) {
        return [];
    }

    await dbContext.kmq
        .insertInto("badges_players")
        .values(toAward.map((a) => ({ user_id: userID, badge_id: a.badgeId })))
        .ignore()
        .execute();

    return toAward.map((a) => ({ badgeId: a.badgeId, name: a.name }));
}
