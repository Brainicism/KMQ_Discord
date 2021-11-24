import Player from "./player";
import { bold } from "../helpers/utils";

export default class Team extends Player {
    private players: { [userID: string]: Player };

    constructor(name: string, player: Player) {
        super(name, name, null, 0);
        this.players = {};
        this.players[player.getID()] = player;
    }

    /** @returns the score of all the players on this team */
    getScore(): number {
        return this.getPlayers().reduce((totalScore, player) => totalScore + player.getScore(), 0);
    }

    /** @returns the name of the team */
    getName(): string {
        return this.name;
    }

    /**
     * @param first - Whether the player won the previous round
     * @returns what to display as the name of the team in the scoreboard
     */
    getDisplayedName(first: boolean, _wonRound: boolean, _duplicateName: boolean): string {
        let name = `Team ${this.getName()}`;
        if (first) {
            name = `🎶 ${bold(name)}`;
        }

        return name;
    }

    /**
     * @param player - The player to add
     * Adds player to this team
     */
    addPlayer(player: Player): void {
        this.players[player.id] = player;
    }

    /**
     * Removes the given player from this team
     */
    removePlayer(userID: string): void {
        delete this.players[userID];
    }

    /**
     * @returns the player associated with the given userID
     */
    getPlayer(userID: string): Player {
        return this.players[userID];
    }

    /**
     * @returns whether the player is on this team
     */
    hasPlayer(userID: string): boolean {
        return userID in this.players;
    }

    /**
     * @returns all players on this team
     */
    getPlayers(): Array<Player> {
        return Object.values(this.players);
    }

    /**
     * @returns the number of players on this team
     */
    getNumPlayers(): number {
        return this.getPlayers().length;
    }
}
