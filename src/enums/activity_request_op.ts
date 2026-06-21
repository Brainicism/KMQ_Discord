type ActivityRequestOp =
    | "snapshot"
    | "guess"
    | "mcGuess"
    | "startGame"
    | "skipVote"
    | "endGame"
    | "hint"
    | "bookmark"
    | "setOption"
    | "autocompleteArtists"
    | "preset"
    | "profile";

export default ActivityRequestOp;
