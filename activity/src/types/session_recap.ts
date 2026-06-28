// Mirror of the "recap" ActivityEvent payload (names resolved server-side).
export default interface SessionRecap {
    mvp: { userID: string; username: string; score: number } | null;
    fastestGuess: {
        userID: string;
        username: string;
        timeMs: number;
    } | null;
    longestStreak: {
        userID: string;
        username: string;
        streak: number;
    } | null;
    totalCorrect: number;
    totalRounds: number;
}
