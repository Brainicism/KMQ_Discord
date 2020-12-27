import Scoreboard from "./scoreboard";
import EliminationPlayer from "./elimination_player";
import _logger from "../logger";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const logger = _logger("elimination_scoreboard");

export default class EliminationScoreboard extends Scoreboard {
    protected players: { [userID: number]: EliminationPlayer };
    private startingLives: number;

    constructor(lives: number) {
        super();
        this.startingLives = lives;
    }

    addPlayer(userID: string, tag: string, avatar: string) {
        this.players[userID] = new EliminationPlayer(tag, userID, avatar, 0, this.startingLives);
    }

    getScoreboardEmbedFields(): Array<{ name: string, value: string, inline: boolean }> {
        return Object.values(this.players)
            .sort((a, b) => b.getLives() - a.getLives())
            .map((x) => {
                const lives = !x.isEliminated() ? `❤️ x ${x.getLives()}` : "Eliminated";
                return {
                    name: x.getName(),
                    value: lives,
                    inline: true,
                };
            });
    }

    awardPoint(_winnerTag: string, winnerID: string, _avatarURL: string, pointsEarned: number) {
        this.players[winnerID].incrementScore(pointsEarned);
    }

    updateScoreboard(_winnerTag: string, winnerID: string, _avatarURL: string, _pointsEarned: number) {
        let maxLives = -1;
        for (const player of Object.values(this.players)) {
            if (player.getId() !== winnerID) {
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

    isPlayerEliminated(userID: string): boolean {
        return this.players[userID].isEliminated();
    }

    decrementAllLives() {
        for (const player of Object.values(this.players)) {
            player.decrementLives();
        }
    }

    gameFinished(): boolean {
        // Game ends if
        // (1) all players are eliminated that round or
        const allEliminated = Object.values(this.players).every((player) => player.isEliminated());

        // (2) there is one player left in a game that started with multiple players
        const oneLeft = Object.values(this.players).length > 1
            && Object.values(this.players).filter((player) => !player.isEliminated()).length === 1;

        return allEliminated || oneLeft;
    }

    isEmpty(): boolean {
        return this.firstPlace.length === 0;
    }

    getPlayerLives(userId: string): number {
        return this.players[userId].getLives();
    }
}
