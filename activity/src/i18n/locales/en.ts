import type Strings from "../strings";

const en: Strings = {
    appTitle: "KMQ",
    statusConnecting: "Connecting...",
    statusDisconnected: "Disconnected from KMQ. Refresh to retry.",
    sessionEndedBanner: (playSlash) =>
        `No active game — start one with the button above (or ${playSlash} in this channel).`,

    headerRound: (n) => `Round ${n}`,
    headerCorrectRatio: (correct, total) => `Correct ${correct}/${total}`,

    roundLabel: (n) => `Round ${n}`,
    roundTimeoutLabel: (sec) => `timeout ${sec}s`,
    waitingForNextRound: "Waiting for the next round...",
    revealWinners: (username, points, exp) =>
        `${username}: +${points} pts, +${exp} EXP`,
    revealAllGuessesSummary: (count) => `All guesses (${count})`,
    openOnYouTube: "Open on YouTube",
    youtubePlayLabel: "▶ YouTube",

    scoreboardHeading: "Scoreboard",
    scoreboardEmpty: "No scoreboard yet.",
    scoreboardEmptyJoinVC: "No players yet — join the voice channel.",
    scoreboardLeft: "(left)",
    scoreboardExpGain: (exp) => `+${exp} EXP`,

    guessPlaceholderActive: "Type your guess...",
    guessPlaceholderWaiting: "Waiting for round...",
    guessButton: "Guess",

    startGameButton: "Start game",
    startGameBusy: "Starting...",
    endGameButton: "End game",
    endGameBusy: "Ending...",

    skipButton: (tally) => `Skip (${tally})`,
    skipDone: "Skipped",
    skipTitle: "Vote to skip this song",
    skipVoteFallback: "vote",

    hintButton: (tally) => `Hint (${tally})`,
    hintRevealed: "Hint revealed",
    hintTitle: "Vote for a hint",
    hintVoteFallback: "vote",

    bookmarkTitleActive: "Bookmark this song",
    bookmarkTitleDone: "Bookmarked — DM'd at end of session",

    networkError: "Network error",
    rejectNoSession: "No active game.",
    rejectMaintenance: "Maintenance mode is on.",
    rejectBanned: "You are banned from KMQ.",
    rejectRateLimit: "Slow down — too many requests.",
    rejectNotInVC: "Join the voice channel first.",
    rejectUnauthorized: "Session expired — refresh.",
    rejectForbidden: "You're not a participant of this Activity.",
    rejectBadRequest: "Bad request.",
    rejectSessionAlreadyRunning: "A game is already running.",
    rejectNoRound: "No round in progress.",
    rejectGeneric: "Action failed.",
};

export default en;
