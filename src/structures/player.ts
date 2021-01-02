export default class Player {
    /** The Discord tag of the player */
    private tag: string;

    /** The Discord user ID of the player */
    private id: string;

    /** The player's current score */
    private score: number;

    /** The player's avatar URL */
    private avatarURL: string;

    constructor(tag: string, id: string, avatarURL: string, points: number) {
        this.tag = tag;
        this.id = id;
        this.score = points;
        this.avatarURL = avatarURL;
    }

    /** @returns the player's Discord tag  */
    getTag(): string {
        return this.tag;
    }

    /** @returns the player's current score */
    getScore(): number {
        return this.score;
    }

    /** @returns the player's Discord ID */
    getId(): string {
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
}
