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
                const heartEmoji = "❤️";
                const lives = x.getLives() <= 5 ? heartEmoji.repeat(x.getLives()) : `${heartEmoji} x ${x.getLives()}`;
                const value = !x.isEliminated() ? lives : "Eliminated";
                return {
                    name: x.getName(),
                    value,
                    inline: true,
                };
            });
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    awardPoint(winnerTag: string, winnerID: string, avatarURL: string, pointsEarned: number) {
        this.players[winnerID].incrementScore(pointsEarned);
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    updateScoreboard(winnerTag: string, winnerID: string, avatarURL: string, pointsEarned: number) {
        let maxLives = -1;
        Object.values(this.players).forEach((player) => {
            if (player.getId() !== winnerID) {
                player.decrementLives();
            }
            if (player.getLives() === maxLives) {
                this.firstPlace.push(player);
            } else if (player.getLives() > maxLives) {
                this.firstPlace = [player];
                maxLives = player.getLives();
            }
        });
    }

    isPlayerEliminated(userID: string): boolean {
        return this.players[userID].isEliminated();
    }

    setPlayers(players: { [userID: number]: {tag: string, avatar: string} }) {
        Object.entries(players).forEach((player) => {
            const userID = player[0];
            const { tag, avatar } = player[1];
            this.players[userID] = new EliminationPlayer(tag, userID, avatar, 0, this.startingLives);
        });
    }

    decrementAllLives() {
        Object.values(this.players).forEach((player) => {
            player.decrementLives();
        });
    }

    allPlayersEliminated() {
        return Object.values(this.players).every((player) => player.isEliminated());
    }

    onePlayerLeft(): boolean {
        // We only care for last alive when there are multiple players
        return Object.values(this.players).length > 1
            && Object.values(this.players).filter((player) => !player.isEliminated()).length === 1;
    }

    isEmpty(): boolean {
        return this.allPlayersEliminated() || this.firstPlace.length === 0;
    }
}
