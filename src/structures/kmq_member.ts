import type Eris from "eris";
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

    constructor(
        username: string,
        tag: string,
        avatarUrl: string,
        id: string,
        pointsAwarded = 0
    ) {
        this.username = username;
        this.tag = tag;
        this.avatarUrl = avatarUrl;
        this.id = id;
        this.pointsAwarded = pointsAwarded;
    }

    static fromUser(
        user: Eris.User | Eris.Member,
        pointsAwarded = 0
    ): KmqMember {
        return new KmqMember(
            user.username,
            getUserTag(user),
            user.avatarURL,
            user.id,
            pointsAwarded
        );
    }
}
