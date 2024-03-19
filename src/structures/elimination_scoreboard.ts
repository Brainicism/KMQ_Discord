import Scoreboard from "./scoreboard";
import type EliminationPlayer from "./elimination_player";
import type SuccessfulGuessResult from "../interfaces/success_guess_result";

export default class EliminationScoreboard extends Scoreboard {
    /** The amount of lives each player starts with */
    public readonly startingLives: number;

    /** Mapping of Discord user ID to EliminationPlayer */
    protected players: { [userID: string]: EliminationPlayer };

    constructor(lives: number, voiceChannelID: string) {
        super(voiceChannelID);
        this.players = {};
        this.startingLives = lives;
    }

    /**
     * Updates the scoreboard with information about correct guessers
     * @param guessResults - Objects containing the user ID, points earned, and EXP gain
     */
    update(guessResults: Array<SuccessfulGuessResult>): void {
        const previousRoundRanking = this.getScoreToRankingMap();
        for (const player of Object.values(this.players)) {
            player.setPreviousRanking(previousRoundRanking[player.getScore()]!);
        }

        // give everybody EXP
        for (const guessResult of guessResults) {
            const correctGuesser = this.players[guessResult.userID]!;
            correctGuesser.incrementExp(guessResult.expGain);
        }

        const guesserIDs = guessResults.map((x) => x.userID);
        let maxLives = -1;
        for (const player of Object.values(this.players)) {
            // guessers don't have lives decremented
            if (!guesserIDs.includes(player.id)) {
                player.decrementLives();
            }

            if (player.getLives() === maxLives) {
                this.firstPlace.push(player);
            } else if (player.getLives() > maxLives) {
                this.firstPlace = [player];
                maxLives = player.getLives();
            }
        }
    }

    /**
     * @param userID - The Discord user ID of the participant to check
     * @returns whether or not the player has ran out of lives
     */
    isPlayerEliminated(userID: string): boolean {
        const player = this.players[userID];
        if (!player) {
            return true;
        }

        return player.isEliminated();
    }

    /** Decrements the lives of all current players */
    decrementAllLives(): void {
        for (const player of Object.values(this.players)) {
            player.decrementLives();
        }
    }

    /**
     * Checks whether the game has finished depending on whether
     * it is a solo or multiplayer game
     * @returns whether or not the game has finished
     */
    gameFinished(): boolean {
        // Game ends if
        // (1) all players are eliminated that round or
        const allEliminated = Object.values(this.players).every((player) =>
            player.isEliminated(),
        );

        // (2) there is one player left in a game that started with multiple players
        const oneLeft =
            Object.values(this.players).length > 1 &&
            Object.values(this.players).filter(
                (player) => !player.isEliminated(),
            ).length === 1;

        return allEliminated || oneLeft;
    }

    /**
     * @param userID - The Discord user ID to check
     * @returns the number of lives the player has remaining
     */
    getPlayerLives(userID: string): number {
        const player = this.players[userID];
        if (!player) return 0;
        return player.getLives();
    }

    /** @returns the number of lives of the player with the least amount of lives (who isn't dead) */
    getLivesOfWeakestPlayer(): number {
        const minimumLives = Object.values(this.players)
            .filter((x) => x.getLives() > 0)
            .reduce((prev, curr) =>
                prev.getLives() < curr.getLives() ? prev : curr,
            )
            .getLives();

        return minimumLives;
    }

    /** @returns the number of players that are alive */
    getAlivePlayersCount(): number {
        return Object.values(this.players).filter(
            (player) => !player.isEliminated(),
        ).length;
    }
}
