class Player {
    #name;
    #score;

    constructor(name) {
        this.name = name;
        this.score = 1;
    }

    getName() {
        return name;
    }

    getScore() {
        return score;
    }

    incrementScore() {
        score++;
    }
}
