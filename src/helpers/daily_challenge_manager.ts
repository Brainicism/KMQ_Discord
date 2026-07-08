import { DAILY_CHALLENGE_LEADERBOARD_SIZE } from "../constants";
import { dailyChallengeDateValue } from "./daily_challenge";
import dbContext from "../database_context";

/** One player's stored Daily Challenge result for a date. */
export interface DailyChallengeResult {
    playerID: string;
    score: number;
    correctCount: number;
    totalCount: number;
    bestStreak: number;
}

/**
 * The viewer's own result for a given day, or null if they haven't played it.
 * @param userID - the player's Discord ID
 * @param isoDate - the challenge date (`YYYY-MM-DD`)
 * @returns the result, or null
 */
export async function getDailyResultForPlayer(
    userID: string,
    isoDate: string,
): Promise<DailyChallengeResult | null> {
    const row = await dbContext.kmq
        .selectFrom("daily_challenge_results")
        .select([
            "player_id",
            "score",
            "correct_count",
            "total_count",
            "best_streak",
        ])
        .where("player_id", "=", userID)
        .where("challenge_date", "=", dailyChallengeDateValue(isoDate))
        .executeTakeFirst();

    if (!row) {
        return null;
    }

    return {
        playerID: row.player_id,
        score: row.score,
        correctCount: row.correct_count,
        totalCount: row.total_count,
        bestStreak: row.best_streak,
    };
}

/**
 * True if the player has already completed the given day's challenge.
 * @param userID - the player's Discord ID
 * @param isoDate - the challenge date (`YYYY-MM-DD`)
 * @returns whether a result row exists
 */
export async function hasCompletedDailyChallenge(
    userID: string,
    isoDate: string,
): Promise<boolean> {
    return (await getDailyResultForPlayer(userID, isoDate)) !== null;
}

/**
 * Top results for a day, highest score first (ties broken by earliest finish).
 * @param isoDate - the challenge date (`YYYY-MM-DD`)
 * @param limit - max rows to return
 * @returns the leaderboard rows
 */
export async function getDailyLeaderboard(
    isoDate: string,
    limit: number = DAILY_CHALLENGE_LEADERBOARD_SIZE,
): Promise<DailyChallengeResult[]> {
    const rows = await dbContext.kmq
        .selectFrom("daily_challenge_results")
        .select([
            "player_id",
            "score",
            "correct_count",
            "total_count",
            "best_streak",
        ])
        .where("challenge_date", "=", dailyChallengeDateValue(isoDate))
        .orderBy("score", "desc")
        .orderBy("completed_at", "asc")
        .limit(limit)
        .execute();

    return rows.map((row) => ({
        playerID: row.player_id,
        score: row.score,
        correctCount: row.correct_count,
        totalCount: row.total_count,
        bestStreak: row.best_streak,
    }));
}
