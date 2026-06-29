// Mirror of the server's ActivityDailyInfoResponse.
export interface DailyLeaderboardEntry {
    userID: string;
    username: string;
    avatarUrl: string | null;
    score: number;
    correctCount: number;
    bestStreak: number;
}

export default interface DailyInfo {
    /** The challenge date this info is for (`YYYY-MM-DD`, UTC). */
    date: string;
    /** Number of rounds in the daily challenge. */
    rounds: number;
    /** Whether the viewer has already completed today's challenge. */
    completed: boolean;
    /** The viewer's result, present iff completed. */
    result: {
        score: number;
        correctCount: number;
        totalCount: number;
        bestStreak: number;
    } | null;
    /** Top results for the day, highest score first. */
    leaderboard: DailyLeaderboardEntry[];
}
