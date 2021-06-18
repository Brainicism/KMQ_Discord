import Player from "./player";
import { bold } from "../helpers/utils";
import _logger from "../logger";
import GuildPreference from "./guild_preference";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const logger = _logger("scoreboard");
export interface SuccessfulGuessResult {
    userID: string;
    pointsEarned: number;
    expGain: number;
}

export default class Scoreboard {
    /** Mapping of Discord user ID to Player */
    protected players: { [userID: string]: Player };

    /** The current players in first place */
    protected firstPlace: Array<Player>;

    /** The current highest score */
    protected highestScore: number;

    constructor() {
        this.players = {};
        this.firstPlace = [];
        this.highestScore = 0;
    }

    /** @returns a string congratulating the winner(s) */
    getWinnerMessage(): string {
        let winnerStr = "";

        if (this.firstPlace.length === 1) {
            return `${this.firstPlace[0].getName()} wins!`;
        }

        for (let i = 0; i < this.firstPlace.length; i++) {
            winnerStr += this.firstPlace[i].getName();
            if (i === this.firstPlace.length - 1) {
                // Last entry -- append just the username
                winnerStr += " ";
            } else if (i === this.firstPlace.length - 2) {
                // Second last entry -- use "and"
                winnerStr += " and ";
            } else {
                // At least two more entries -- separate by ","
                winnerStr += ", ";
            }
        }
        winnerStr += "win!";
        return winnerStr;
    }

    /** @returns An array of DiscordEmbed fields representing each participant's score */
    getScoreboardEmbedFields(): Array<{ name: string, value: string, inline: boolean }> {
        return Object.values(this.players)
            .sort((a, b) => b.getScore() - a.getScore())
            .map((x, index) => (
                {
                    name: `${index + 1}. ${x.getName()}`,
                    value: x.getDisplayedScore(),
                    inline: true,
                }));
    }

    /**
     * Separates scoreboard players into two fields for large games
     * @param cutoff - How many players to include before truncating the scoreboard
     * @returns An array of 2 DiscordEmbed fields containing each player and their score, separated by newline
     */
    getScoreboardEmbedTwoFields(cutoff: number): Array<{ name: string, value: string, inline: boolean }> {
        const ZERO_WIDTH_SPACE = "​";
        const players = Object.values(this.players)
            .sort((a, b) => b.getScore() - a.getScore())
            .slice(0, cutoff)
            .map((x, index) => `${index + 1}. ${bold(x.getName())}: ${x.getDisplayedScore()}`);
        if (this.getNumPlayers() > cutoff) {
            players.push("and many others...");
        }
        return [
            {
                name: ZERO_WIDTH_SPACE,
                value: players.slice(0, Math.ceil(players.length / 2)).join("\n"),
                inline: true,
            },
            {
                name: ZERO_WIDTH_SPACE,
                value: players.slice(Math.ceil(players.length / 2)).join("\n"),
                inline: true,
            },
        ];
    }

    /**
     * Updates the scoreboard with information about correct guessers
     * @param guessResults - Objects containing the user ID, points earned, and EXP gain
     */
    updateScoreboard(guessResults: Array<SuccessfulGuessResult>) {
        for (const guessResult of guessResults) {
            if (!this.players[guessResult.userID]) {
                this.players[guessResult.userID] = Player.fromUserID(guessResult.userID);
            }

            this.players[guessResult.userID].incrementScore(guessResult.pointsEarned);

            this.players[guessResult.userID].incrementExp(guessResult.expGain);
            const winnerScore = this.players[guessResult.userID].getScore();

            if (winnerScore === this.highestScore) {
                // If user is tied for first, add them to the first place array
                this.firstPlace.push(this.players[guessResult.userID]);
            } else if (winnerScore > this.highestScore) {
                // If user is first, reset first place array and add them
                this.highestScore = winnerScore;
                this.firstPlace = [this.players[guessResult.userID]];
            }
        }
    }

    /**
     * @returns whether the scoreboard has any players on it
     * (if there are none in first place, then the scoreboard must be empty)
     */
    isEmpty(): boolean {
        return this.firstPlace.length === 0;
    }

    /** @returns a list of the player currently in first place */
    getWinners(): Array<Player> {
        return this.firstPlace;
    }

    /**
     * @param userID - The Discord user ID of the player to check
     * @returns the score of the player
     */
    getPlayerScore(userID: string): number {
        if (userID in this.players) {
            return this.players[userID].getScore();
        }
        return 0;
    }

    /**
     * @param userID - The Discord user ID of the player to check
     * @returns the exp gained by the player
     */
    getPlayerExpGain(userID: string): number {
        if (userID in this.players) {
            return this.players[userID].getExpGain();
        }
        return 0;
    }

    /**
     * @param guildPreference - The GuildPreference
     * @returns whether the game has completed
     * */
    gameFinished(guildPreference: GuildPreference): boolean {
        return guildPreference.isGoalSet() && !this.isEmpty() && this.firstPlace[0].getScore() >= guildPreference.getGoal();
    }

    /** @returns a list of tags of the player participating in the game */
    getPlayerNames(): Array<string> {
        return Object.values(this.players).map((player) => player.getName());
    }

    /**
     *  @param userID - The Discord user ID of the Player
     *  @returns a Player object for the corresponding user ID
     * */
    getPlayerName(userID: string): string {
        return this.players[userID].getName();
    }

    /**
     *  @returns the number of players on the scoreboard
     * */
    getNumPlayers(): number {
        return Object.keys(this.players).length;
    }
}
