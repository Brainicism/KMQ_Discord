import type ActivityScoreboardPlayer from "./activity_scoreboard_player";

export default interface ActivityScoreboardSnapshot {
    players: ActivityScoreboardPlayer[];
    winnerIDs: string[];
    highestScore: number;
}
