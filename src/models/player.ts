export default class Player {
    private name: string;
    private score: number;
    constructor(name: string) {
        this.name = name;
        this.score = 1;
    }

    getName(): string {
        return this.name;
    }

    getScore(): number {
        return this.score;
    }

    incrementScore() {
        this.score++;
    }
};
