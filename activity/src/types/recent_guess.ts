export default interface RecentGuess {
    userID: string;
    /** Resolved at guess time on the server so the ticker doesn't depend on
     *  a later scoreboardUpdate to render a display name. */
    username: string;
    isCorrect: boolean;
    ts: number;
}
