export default class KmqMember {
    /** The username */
    public username: string;

    /** The Discord tag  */
    public tag: string;

    /** The avatar Url */
    public avatarUrl: string;

    /** The Discord ID */
    public id: string;

    /** Number of points the member has received */
    public pointsAwarded: number;

    constructor(id: string, pointsAwarded = 0) {
        this.id = id;
        this.pointsAwarded = pointsAwarded;
    }
}
