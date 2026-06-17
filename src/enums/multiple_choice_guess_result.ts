/** Outcome of a multiple-choice pick, shared by the Discord button handler
 *  and the Activity. */
enum MultipleChoiceGuessResult {
    /** No active round, the player already picked wrong this round, or they
     *  aren't eligible to guess (not in VC, wrong channel, etc.). */
    INELIGIBLE = "ineligible",
    /** A valid but wrong pick — the player is now out for this round. */
    INCORRECT = "incorrect",
    /** The correct pick. */
    CORRECT = "correct",
}

export default MultipleChoiceGuessResult;
