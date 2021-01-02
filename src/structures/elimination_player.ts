import Player from "./player";

export default class EliminationPlayer extends Player {
    /** The number of lives the player has remaining */
    private lives: number;

    constructor(name: string, id: string, avatarURL: string, points: number, lives: number) {
        super(name, id, avatarURL, points);
        this.lives = lives;
    }

    /** @returns the number of lives the player has remaining */
    getLives(): number {
        return this.lives;
    }

    /** Decreases the amount of lives the player has remaining */
    decrementLives(): void {
        if (this.lives > 0) {
            this.lives--;
        }
    }

    /** @returns whether the player has ran out of lives */
    isEliminated(): boolean {
        return this.lives === 0;
    }
}
