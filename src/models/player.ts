export default class Player {
    private tag: string;
    private id: string;
    private score: number;
    private avatarURL: string;

    constructor(tag: string, id: string, avatarURL: string, points: number) {
        this.tag = tag;
        this.id = id;
        this.score = points;
        this.avatarURL = avatarURL;
    }

    getTag(): string {
        return this.tag;
    }

    getScore(): number {
        return this.score;
    }

    getId(): string {
        return this.id;
    }

    getAvatarURL(): string {
        return this.avatarURL;
    }

    incrementScore(pointsEarned: number) {
        this.score += pointsEarned;
    }
}
