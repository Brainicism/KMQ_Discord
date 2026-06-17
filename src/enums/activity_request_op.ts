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
    | "autocompleteArtists";

export default ActivityRequestOp;
