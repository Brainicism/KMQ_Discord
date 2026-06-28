/**
 * End-of-session summary, computed from accumulated session state (no DB).
 * userIDs are resolved to names by the consumer (the legacy embed via the
 * scoreboard; the Activity via the bridge's name lookup).
 */
export default interface GameSessionRecap {
    /** Top scorer (sole/shared first place), or null if nobody scored. */
    mvp: { userID: string; score: number } | null;
    /** Fastest correct guess, or null if there were none. */
    fastestGuess: { userID: string; timeMs: number } | null;
    /** Longest guess streak reached, or null if there were none. */
    longestStreak: { userID: string; streak: number } | null;
    /** Songs correctly guessed this session. */
    totalCorrect: number;
    /** Rounds played this session. */
    totalRounds: number;
}
