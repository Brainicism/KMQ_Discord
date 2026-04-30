// All user-facing strings live behind this interface so the renderer never
// hardcodes text. Each function/template explicitly enumerates substitutions
// (rather than parsing `{vars}`) — TypeScript catches missing args at the
// call site and there's no runtime template lib.
export default interface Strings {
    appTitle: string;
    statusConnecting: string;
    statusDisconnected: string;
    sessionEndedBanner: (playSlash: string) => string;

    headerRound: (n: number) => string;
    headerCorrectRatio: (correct: number, total: number) => string;

    roundLabel: (n: number) => string;
    roundTimeoutLabel: (sec: number) => string;
    waitingForNextRound: string;
    revealWinners: (username: string, points: number, exp: number) => string;
    revealAllGuessesSummary: (count: number) => string;
    openOnYouTube: string;
    youtubePlayLabel: string;

    scoreboardHeading: string;
    scoreboardEmpty: string;
    scoreboardEmptyJoinVC: string;
    scoreboardLeft: string;
    scoreboardExpGain: (exp: number) => string;

    guessPlaceholderActive: string;
    guessPlaceholderWaiting: string;
    guessButton: string;

    startGameButton: string;
    startGameBusy: string;
    endGameButton: string;
    endGameBusy: string;

    skipButton: (tally: string) => string;
    skipDone: string;
    skipTitle: string;
    skipVoteFallback: string;

    hintButton: (tally: string) => string;
    hintRevealed: string;
    hintTitle: string;
    hintVoteFallback: string;

    bookmarkButton: string;
    bookmarkBookmarked: string;
    bookmarkTitleActive: string;
    bookmarkTitleDone: string;

    networkError: string;
    rejectNoSession: string;
    rejectMaintenance: string;
    rejectBanned: string;
    rejectRateLimit: string;
    rejectNotInVC: string;
    rejectUnauthorized: string;
    rejectForbidden: string;
    rejectBadRequest: string;
    rejectSessionAlreadyRunning: string;
    rejectNoRound: string;
    rejectGeneric: string;
}
