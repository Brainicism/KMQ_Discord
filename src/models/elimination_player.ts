import Player from "./player";

export default class EliminationPlayer extends Player {
    private lives: number;

    constructor(name: string, id: string, avatarURL: string, points: number, lives: number) {
        super(name, id, avatarURL, points);
        this.lives = lives;
    }

    getLives(): number {
        return this.lives;
    }

    decrementLives(): void {
        if (this.lives > 0) {
            this.lives--;
        }
    }

    isEliminated(): boolean {
        return this.lives === 0;
    }
}
