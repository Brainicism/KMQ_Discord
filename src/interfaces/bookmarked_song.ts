import type QueriedSong from "./queried_song";

export default interface BookmarkedSong {
    song: QueriedSong;
    bookmarkedAt: Date;
}
