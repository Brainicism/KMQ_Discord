export default interface ActivityRoundMeta {
    roundIndex: number;
    songStartedAt: number;
    guessTimeoutSec: number | null;
    /** When the active guess-timeout started ticking (epoch ms). Equals
     *  songStartedAt at round start; reset to "now" if the timer is changed
     *  mid-round. Used as the countdown reference. */
    timerStartedAt: number;
}
