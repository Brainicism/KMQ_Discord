import Eris from "eris";
import { getUserTag } from "../helpers/discord_utils";

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

    /** Whether the member has bonus EXP */
    public voteBonusExp: boolean;

    constructor(username: string, tag: string, avatarUrl: string, id: string, pointsAwarded = 0) {
        this.username = username;
        this.tag = tag;
        this.avatarUrl = avatarUrl;
        this.id = id;
        this.pointsAwarded = pointsAwarded;
        this.voteBonusExp = false;
    }

    static fromUser(user: Eris.User, pointsAwarded = 0) {
        return new KmqMember(user.username, getUserTag(user), user.avatarURL, user.id, pointsAwarded);
    }
}
