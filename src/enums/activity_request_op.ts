type ActivityRequestOp =
    | "snapshot"
    | "guess"
    | "mcGuess"
    | "startGame"
    | "skipVote"
    | "endGame"
    | "hint"
    | "emote"
    | "bookmark"
    | "setOption"
    | "autocompleteArtists"
    | "preset"
    | "profile"
    | "songInfo"
    | "searchSongs"
    | "dailyChallengeInfo"
    | "startDailyChallenge";

export default ActivityRequestOp;
