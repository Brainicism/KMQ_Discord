export default class Player {
    private name: string;
    private id: string;
    private score: number;
    constructor(name: string, id: string) {
        this.name = name;
        this.id = id;
        this.score = 1;
    }

    getName(): string {
        return this.name;
    }

    getScore(): number {
        return this.score;
    }

    getId(): string {
        return this.id;
    }

    incrementScore() {
        this.score++;
    }
};
