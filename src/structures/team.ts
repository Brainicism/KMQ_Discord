import { bold, chooseRandom, escapedFormatting } from "../helpers/utils";
import Player from "./player";

export default class Team extends Player {
    private players: { [userID: string]: Player };

    constructor(name: string, player: Player, guildID: string) {
        super(name, guildID, null, 0, name);
        this.players = {};
        this.players[player.id] = player;
    }

    /** @returns the score of all the players on this team */
    getScore(): number {
        return this.getPlayers().reduce(
            (totalScore, player) => totalScore + player.getScore(),
            0,
        );
    }

    /** @returns the name of the team */
    getName(): string {
        return this.id;
    }

    /**
     * @param first - Whether the player won the previous round
     * @param _wonRound - unused
     * @param _mention - unused
     * @returns what to display as the name of the team in the scoreboard
     */
    getDisplayedName(
        first: boolean,
        _wonRound: boolean,
        _mention: boolean,
    ): string {
        let name = `Team ${escapedFormatting(this.getName())}`;
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
     * @param userID - The userID of the player to remove
     * Removes the given player from this team
     */
    removePlayer(userID: string): void {
        delete this.players[userID];
    }

    /**
     * @param userID - The userID of the player to get
     * @returns the player associated with the given userID
     */
    getPlayer(userID: string): Player {
        return this.players[userID];
    }

    /**
     * @param userID - The userID of the player to check
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

    /** @returns the team's EXP gain */
    getExpGain(): number {
        return Math.floor(
            Object.values(this.players).reduce(
                (total, curr) => total + curr.getExpGain(),
                0,
            ),
        );
    }

    /** @returns a random team member's avatar URL */
    getAvatarURL(): string {
        return (
            chooseRandom(
                Object.values(this.players).map((x) => x.getAvatarURL()),
            ) ?? ""
        );
    }

    /**
     * @returns whether to include this team in the scoreboard
     */
    shouldIncludeInScoreboard(): boolean {
        return true;
    }
}
