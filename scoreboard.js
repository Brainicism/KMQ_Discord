const Player = require("./player.js")

module.exports = class Scoreboard {
    constructor() {
        // players stores each entry as:
        // {name: "username", value: SCORE_VAL }
        this._players = [];
        this._firstPlace = [];
        // Both players and firstPlace are arrays of Player objects
    }

    getWinner() {
        let winnerStr = "";
        let isTie = (this._firstPlace.length > 1);
        for (let i = 0; i < this._firstPlace.length; i++) {
            if (this._firstPlace.length == 1) {
                winnerStr = this._firstPlace[i].getName() + " ";
            }
            else if (this._firstPlace.length - i == 1) {
                // Last entry -- append just the username
                winnerStr += this._firstPlace[i].getName() + " ";
            }
            else if (this._firstPlace.length - i == 2) {
                // Second last entry -- use "and"
                winnerStr += this._firstPlace[i].getName() + " and ";
            }
            else {
                winnerStr += this._firstPlace[i].getName() + ", ";
            }
        }
        if (isTie) winnerStr += "win!";
        else winnerStr += "wins!";
        return winnerStr;
    }

    updateWinner() {
        // Requires: scoreboard must be sorted
        this._firstPlace = [];
        let highScore = this._players[0].getScore();
        for (let i = 0; i < this._players.length; i++) {
            if (this._players[i].getScore() == highScore) {
                this._firstPlace.push(this._players[i]);
            }
            else break;
        }
    }

    getScoreboard() {
        return this._players.map((x) => {
            return { name: x.getName(), value: x.getScore() }
        })
    }

    sortScoreboard() {
        this._players.sort((a, b) => { return b.getScore() - a.getScore(); })
    }

    updateScoreboard(winner) {
        let index = -1;
        for (let i = 0; i < this._players.length; i++) {
            if (this._players[i].getName() == winner) {
                index = i;
                break;
            }
        }
        if (index == -1) {
            this._players.push(new Player(winner));
            this.updateWinner();
        }
        else {
            this._players[index].incrementScore();
            this.sortScoreboard();
            this.updateWinner();
        }
    }

    isEmpty() {
        if (this._players.length) return false;
        return true;
    }
};
