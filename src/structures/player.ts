import {
    ExpBonusModifier,
    ExpBonusModifierValues,
} from "../commands/game_commands/exp";
import { getUserTag, getMention } from "../helpers/discord_utils";
import { bold } from "../helpers/utils";
import { state } from "../kmq_worker";

export default class Player {
    /** The Discord tag of the player, of the format "Player#1234" */
    public readonly name: string;

    /** The Discord user ID of the player */
    public readonly id: string;

    /** The player's current score */
    protected score: number;

    /** The player's avatar URL */
    private readonly avatarURL: string;

    /** The player's EXP gain */
    private expGain: number;

    /** Whether it's the player's first game of the day */
    private firstGameOfTheDay: boolean;

    constructor(
        tag: string,
        id: string,
        avatarURL: string,
        points: number,
        firstGameOfTheDay = false
    ) {
        this.name = tag;
        this.id = id;
        this.score = points;
        this.avatarURL = avatarURL;
        this.expGain = 0;
        this.firstGameOfTheDay = firstGameOfTheDay;
    }

    static fromUserID(userID: string, firstGameOfDay = false): Player {
        const user = state.client.users.get(userID);
        return new Player(
            getUserTag(user),
            user.id,
            user.avatarURL,
            0,
            firstGameOfDay
        );
    }

    /** @returns the player's Discord tag  */
    getName(): string {
        return this.name;
    }

    /**
     * Prints the tag (including the discriminator) in the smaller scoreboard, but only
     * the username in the larger scoreboard
     * @param first - Whether the player won the previous round
     * @param wonRound - Whether the player guessed correctly in the previous round
     * @param mention - Whether the displayed name should be a clickable mention
     * @returns what to display as the name of the player in the scoreboard
     */
    getDisplayedName(
        first: boolean,
        wonRound: boolean,
        mention: boolean
    ): string {
        let name = this.name;
        if (mention) {
            name = getMention(this.getID());
        }

        if (wonRound) {
            if (!mention) {
                name = bold(name);
            }

            if (first) {
                name = `🎶 ${name}`;
            } else {
                name = `🎵 ${name}`;
            }
        }

        return name;
    }

    /** @returns the player's current score */
    getScore(): number {
        return this.score;
    }

    /** @returns what to display as the score in the scoreboard for the player */
    getDisplayedScore(): string {
        const rounded = Number(this.getScore().toFixed(1));
        return Number.isInteger(rounded)
            ? rounded.toFixed()
            : rounded.toFixed(1);
    }

    /** @returns the player's EXP gain */
    getExpGain(): number {
        return Math.floor(this.expGain);
    }

    /** @returns the player's Discord ID */
    getID(): string {
        return this.id;
    }

    /** @returns the player's avatar URL */
    getAvatarURL(): string {
        return this.avatarURL;
    }

    /**
     * Increments the player's score by the specified amount
     * @param pointsEarned - The number of points earned by the correct guess
     */
    incrementScore(pointsEarned: number): void {
        this.score += pointsEarned;
    }

    /**
     * Increment the player's EXP gain by the specified amount
     * @param expGain - The amount of EXP that was gained
     */

    incrementExp(expGain: number): void {
        this.expGain +=
            (this.firstGameOfTheDay
                ? ExpBonusModifierValues[ExpBonusModifier.FIRST_GAME_OF_DAY]
                : 1) * expGain;
    }

    /**
     * @param currentRoundRanking - The current round's ranking of players
     * @param previousRoundRanking - The last round's ranking of players
     * @param inProgress - Whether the game is in progress
     * @returns what to prefix player's name with in the scoreboard
     */
    getRankingPrefix(
        currentRoundRanking: Array<string>,
        previousRoundRanking: Array<string>,
        inProgress: boolean
    ): string {
        const currentRank = currentRoundRanking.indexOf(this.getID());
        const previousRank = previousRoundRanking.indexOf(this.getID());
        if (!inProgress || previousRank < 0 || currentRank === previousRank) {
            return `${currentRank + 1}.`;
        }

        if (currentRank < previousRank) {
            return "↑";
        }

        if (currentRank > previousRank) {
            return "↓";
        }
    }
}
