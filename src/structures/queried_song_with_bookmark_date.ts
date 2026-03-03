import QueriedSong from "./queried_song.js";

export default class QueriedSongWithBookmarkDate extends QueriedSong {
    bookmarkedAt: Date;

    constructor(data: any) {
        super(data);
        this.bookmarkedAt = data.bookmarkedAt;
    }
}
