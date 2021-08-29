import { getUserTag, getMention } from "../helpers/discord_utils";
import { roundDecimal, bold } from "../helpers/utils";
import { state } from "../kmq";

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

    constructor(tag: string, id: string, avatarURL: string, points: number) {
        this.name = tag;
        this.id = id;
        this.score = points;
        this.avatarURL = avatarURL;
        this.expGain = 0;
    }

    static fromUserID(userID: string) {
        const user = state.client.users.get(userID);
        return new Player(getUserTag(user), user.id, user.avatarURL, 0);
    }

    /** @returns the player's Discord tag  */
    getName(): string {
        return this.name;
    }
    /**
     * Prints the tag (including the discriminator) in the smaller scoreboard, but only
     * the username in the larger scoreboard
     * @param wonRound - Whether the player won the previous round
     * @param mention - Whether the displayed name should be a clickable mention
     * @returns what to display as the name of the player in the scoreboard
     */
    getDisplayedName(wonRound: boolean, mention: boolean): string {
        let name = this.name;
        if (mention) {
            name = getMention(this);
        }

        if (wonRound) {
            if (!mention) {
                name = bold(name);
            }

            name = `🎵 ${name}`;
        }

        return name;
    }

    /** @returns the player's current score */
    getScore(): number {
        return this.score;
    }

    /** @returns what to display as the score in the scoreboard for the player */
    getDisplayedScore(): string {
        return Number.isInteger(roundDecimal(this.getScore(), 1)) ? roundDecimal(this.getScore(), 1).toString() : this.getScore().toFixed(1);
    }

    /** @returns the player's EXP gain */
    getExpGain(): number {
        return this.expGain;
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
    incrementScore(pointsEarned: number) {
        this.score += pointsEarned;
    }

    /**
     * Increment the player's EXP gain by the specified amount
     * @param expGain - The amount of EXP that was gained
     */

    incrementExp(expGain: number) {
        this.expGain += expGain;
    }
}
