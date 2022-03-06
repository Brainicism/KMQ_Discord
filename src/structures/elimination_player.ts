import Player from "./player";
import { getUserTag } from "../helpers/discord_utils";
import { state } from "../kmq_worker";
import { DEFAULT_LIVES } from "./elimination_scoreboard";

export default class EliminationPlayer extends Player {
    // this.score => the player's lives

    static fromUserID(
        userID: string,
        score = DEFAULT_LIVES,
        firstGameOfDay = false
    ): EliminationPlayer {
        const user = state.client.users.get(userID);

        return new EliminationPlayer(
            getUserTag(user),
            user.id,
            user.avatarURL,
            score,
            firstGameOfDay
        );
    }

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

    /**
     * @returns whether to include this player in the scoreboard
     */
    includeInScoreboard(): boolean {
        return true;
    }
}
