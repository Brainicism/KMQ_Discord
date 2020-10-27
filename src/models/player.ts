export default class Player {
    private name: string;
    private id: string;
    private score: number;
    private avatarURL: string;

    constructor(name: string, id: string, avatarURL: string, points: number) {
        this.name = name;
        this.id = id;
        this.score = points;
        this.avatarURL = avatarURL;
    }

    getName(): string {
        return this.name;
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
};
