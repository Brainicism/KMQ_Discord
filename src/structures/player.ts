import { ExpBonusModifierValues } from "../constants";
import { bold, getMention } from "../helpers/utils";
import ExpBonusModifier from "../enums/exp_bonus_modifier";
import State from "../state";

export default class Player {
    /** The Discord username of the player sans discriminator,
     * i.e. "Player" when the player's user tag is "Player#1234"
     */
    public readonly name: string;

    /** The Discord user ID of the player */
    public readonly id: string;

    public readonly premium: boolean;

    /** Whether the player is still in the game voice channel */
    public inVC: boolean;

    /** The player's current score */
    protected score: number;

    /** The player's avatar URL */
    private readonly avatarURL: string;

    /** The player's EXP gain */
    private expGain: number;

    /** Whether it's the player's first game of the day */
    private firstGameOfTheDay: boolean;

    /** The previous round's ranking */
    private previousRoundRanking: number;

    constructor(
        name: string,
        id: string,
        avatarURL: string,
        points: number,
        firstGameOfTheDay = false,
        premium = false
    ) {
        this.name = name;
        this.id = id;
        this.inVC = true;
        this.score = points;
        this.avatarURL = avatarURL;
        this.expGain = 0;
        this.firstGameOfTheDay = firstGameOfTheDay;
        this.premium = premium;
        this.previousRoundRanking = null;
    }

    static fromUserID(
        userID: string,
        score = 0,
        firstGameOfDay = false,
        premium = false
    ): Player {
        const user = State.client.users.get(userID);

        return new Player(
            user.username,
            user.id,
            user.avatarURL,
            score,
            firstGameOfDay,
            premium
        );
    }

    /**
     * Formats the player's name depending on whether they won the round, if they guessed first,
     * and if their name should be a Discord mention
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
        if (mention && this.inVC) {
            name = getMention(this.id);
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
        return bold(
            Number.isInteger(rounded) ? rounded.toFixed() : rounded.toFixed(1)
        );
    }

    /** @returns the player's EXP gain */
    getExpGain(): number {
        return Math.floor(this.expGain);
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

    setPreviousRanking(previousRanking: number): void {
        this.previousRoundRanking = previousRanking;
    }

    /**
     * @param currentRoundRanking - The player's current round ranking
     * @param inProgress - Whether the game is in progress
     * @returns what to prefix player's name with in the scoreboard
     */
    getRankingPrefix(currentRoundRanking: number, inProgress: boolean): string {
        const previousRank = this.previousRoundRanking;
        const currentRank = currentRoundRanking;
        const displayedRank = `${currentRank + 1}.`;
        if (
            !inProgress ||
            previousRank === null ||
            currentRank === previousRank
        ) {
            return displayedRank;
        }

        if (currentRank < previousRank) {
            return `↑ ${displayedRank}`;
        }

        if (currentRank > previousRank) {
            return `↓ ${displayedRank}`;
        }

        return displayedRank;
    }

    /**
     * @returns whether to include this player in the scoreboard
     */
    shouldIncludeInScoreboard(): boolean {
        return this.getScore() > 0 || this.inVC;
    }
}
