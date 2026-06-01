/** One multiple-choice option. `id` is the round's button custom_id (uuid);
 *  the correct one is never flagged here so the client can't cheat. */
export interface ActivityMultipleChoiceOption {
    id: string;
    label: string;
}

export default interface ActivityRoundMeta {
    roundIndex: number;
    songStartedAt: number;
    guessTimeoutSec: number | null;
    /** When the active guess-timeout started ticking (epoch ms). Equals
     *  songStartedAt at round start; reset to "now" if the timer is changed
     *  mid-round. Used as the countdown reference. */
    timerStartedAt: number;
    /** Present only in multiple-choice mode: the shuffled choices for this
     *  round. Absent (undefined) when guessing is by typing/hidden. */
    choices?: Array<ActivityMultipleChoiceOption>;
}
