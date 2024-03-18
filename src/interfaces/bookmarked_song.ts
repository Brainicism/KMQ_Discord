import type QueriedSong from "../structures/queried_song";

export default interface BookmarkedSong {
    song: QueriedSong;
    bookmarkedAt: Date;
}
