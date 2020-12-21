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

    getScoreboardEmbedFields(): Array<{ name: string, value: string, inline: boolean }> {
        return Object.values(this.players)
            .sort((a, b) => b.getLives() - a.getLives())
            .map((x) => {
                const lives = !x.isEliminated() ? `Lives: ${x.getLives()}` : "Eliminated";
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

    setPlayers(players: { [userID: number]: {tag: string, avatar: string} }) {
        for (const player of Object.entries(players)) {
            const userID = player[0];
            const { tag, avatar } = player[1];
            this.players[userID] = new EliminationPlayer(tag, userID, avatar, 0, this.startingLives);
        }
    }

    decrementAllLives() {
        for (const player of Object.values(this.players)) {
            player.decrementLives();
        }
    }

    gameFinished(): boolean {
        const allEliminated = Object.values(this.players).every((player) => player.isEliminated());
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

    numberOfPlayers(): number {
        return Object.keys(this.players).length;
    }

    getStartingLives(): number {
        return this.startingLives;
    }
}
