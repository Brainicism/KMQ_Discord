export default interface ActivityCorrectGuesser {
    id: string;
    username: string;
    avatarUrl: string | null;
    pointsEarned: number;
    expGain: number;
    /** Current correct-guess streak after this round (legacy shows 🔥 at 5+). */
    streak: number;
    /** Milliseconds from song start to this player's correct guess; null if
     *  unavailable (e.g. multiple-choice rounds). */
    timeToGuessMs: number | null;
}
