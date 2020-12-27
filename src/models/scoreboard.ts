import { roundDecimal } from "../helpers/utils";
import Player from "./player";

export default class Scoreboard {
    protected players: { [userID: number]: Player };

    protected firstPlace: Array<Player>;

    private highestScore: number;

    constructor() {
        this.players = {};
        this.firstPlace = [];
        this.highestScore = 0;
    }

    getWinnerMessage(): string {
        let winnerStr = "";

        if (this.firstPlace.length === 1) {
            return `${this.firstPlace[0].getName()} wins!`;
        }

        for (let i = 0; i < this.firstPlace.length; i++) {
            winnerStr += this.firstPlace[i].getName();
            if (i === this.firstPlace.length - 1) {
                // Last entry -- append just the username
                winnerStr += " ";
            } else if (i === this.firstPlace.length - 2) {
                // Second last entry -- use "and"
                winnerStr += " and ";
            } else {
                // At least two more entries -- separate by ","
                winnerStr += ", ";
            }
        }
        winnerStr += "win!";
        return winnerStr;
    }

    getScoreboardEmbedFields(): Array<{ name: string, value: string, inline: boolean }> {
        return Object.values(this.players)
            .sort((a, b) => b.getScore() - a.getScore())
            .map((x) => (
                {
                    name: x.getName(),
                    value: Number.isInteger(roundDecimal(x.getScore(), 1)) ? roundDecimal(x.getScore(), 1).toString() : x.getScore().toFixed(1),
                    inline: true,
                }));
    }

    getPlayerScores(): Array<{ id: string, score: number }> {
        return Object.values(this.players)
            .map((x) => ({
                id: x.getId(),
                score: x.getScore(),
            }));
    }

    updateScoreboard(winnerTag: string, winnerID: string, avatarURL: string, pointsEarned: number) {
        if (!this.players[winnerID]) {
            this.players[winnerID] = new Player(winnerTag, winnerID, avatarURL, pointsEarned);
        } else {
            this.players[winnerID].incrementScore(pointsEarned);
        }

        if (this.players[winnerID].getScore() === this.highestScore) {
            // If user is tied for first, add them to the first place array
            this.firstPlace.push(this.players[winnerID]);
        } else if (this.players[winnerID].getScore() > this.highestScore) {
            // If user is first, reset first place array and add them
            this.highestScore = this.players[winnerID].getScore();
            this.firstPlace = [this.players[winnerID]];
        }
    }

    isEmpty(): boolean {
        return !(Object.keys(this.players).length);
    }

    getWinners(): Array<Player> {
        return this.firstPlace;
    }

    getPlayerScore(userId: string): number {
        if (userId in this.players) {
            return this.players[userId].getScore();
        }
        return 0;
    }

    gameFinished(goal: number): boolean {
        return this.firstPlace[0].getScore() >= goal;
    }

    getPlayerNames(): Array<string> {
        return Object.values(this.players).map((player) => player.getName());
    }
}
