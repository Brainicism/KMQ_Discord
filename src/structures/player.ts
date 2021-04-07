import { getUserTag } from "../helpers/discord_utils";
import state from "../kmq";

export default class Player {
    /** The Discord tag of the player */
    public readonly name: string;

    /** The Discord user ID of the player */
    public readonly id: string;

    /** The player's avatar URL */
    private readonly avatarURL: string;

    /** The player's current score */
    private score: number;

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
        return new Player(user.username, getUserTag(user), user.avatarURL, 0);
    }

    /** @returns the player's Discord tag  */
    getName(): string {
        return this.name;
    }

    /** @returns the player's current score */
    getScore(): number {
        return this.score;
    }

    /** @returns the player's EXP gain */
    getExpGain(): number {
        return this.expGain;
    }

    /** @returns the player's Discord ID */
    getID(): string {
        return this.id;
    }

    /** returns the player's avatar URL */
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
