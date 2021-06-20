import Player from "./player";

export default class EliminationPlayer extends Player {
    // this.score => the player's lives

    /** @returns the number of lives the player has remaining */
    getLives(): number {
        return this.score;
    }

    /** Decreases the amount of lives the player has remaining */
    decrementLives(): void {
        if (this.score > 0) {
            this.score--;
        }
    }

    /** @returns whether the player has ran out of lives */
    isEliminated(): boolean {
        return this.score === 0;
    }

    /** @returns the lives of the player formatted for the scoreboard */
    getDisplayedScore(): string {
        return !this.isEliminated() ? `❤️ x ${this.getLives()}` : "☠️";
    }
}
