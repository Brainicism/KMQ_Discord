class Scoreboard {

    updateScoreboard(winner) {
        let index = players.name.indexOf(winner);
        if (index == -1) {
            players.push(new Player(winner));
        }
        else {
            players[index].incrementScore();
        }
    }

    returnScoreboard() {
        
    }
}
