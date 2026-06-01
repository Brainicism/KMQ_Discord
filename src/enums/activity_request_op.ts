type ActivityRequestOp =
    | "snapshot"
    | "guess"
    | "startGame"
    | "skipVote"
    | "endGame"
    | "hint"
    | "bookmark"
    | "setOption"
    | "autocompleteArtists";

export default ActivityRequestOp;
