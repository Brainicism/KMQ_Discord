export default class KmqMember {
    /** The username */
    public username: string;

    /** The Discord tag  */
    public tag: string;

    /** The avatar Url */
    public avatarUrl: string;

    /** The Discord ID */
    public id: string;

    constructor(username: string, tag: string, avatarUrl: string, id: string) {
        this.username = username;
        this.tag = tag;
        this.avatarUrl = avatarUrl;
        this.id = id;
    }
}
