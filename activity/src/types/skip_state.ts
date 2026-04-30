export default interface SkipState {
    requesters: number;
    threshold: number;
    achieved: boolean;
    /** Local-only: this client's vote has been registered for the current round. */
    userVoted: boolean;
}
