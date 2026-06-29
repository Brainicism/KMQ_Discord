type ActivityRequestOp =
    | "snapshot"
    | "guess"
    | "mcGuess"
    | "startGame"
    | "skipVote"
    | "endGame"
    | "hint"
    | "emote"
    | "chat"
    | "bookmark"
    | "setOption"
    | "autocompleteArtists"
    | "preset"
    | "profile"
    | "songInfo"
    | "searchSongs"
    | "webRoomMembership"
    | "dailyChallengeInfo"
    | "startDailyChallenge";

export default ActivityRequestOp;
