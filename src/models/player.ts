export default class Player {
    private name: string;
    private score: number;
    constructor(name) {
        this.name = name;
        this.score = 1;
    }

    getName() {
        return this.name;
    }

    getScore() {
        return this.score;
    }

    incrementScore() {
        this.score++;
    }
};
