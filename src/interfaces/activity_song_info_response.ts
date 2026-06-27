import type SongInfo from "./song_info";

export default interface ActivitySongInfoResponse {
    /** False when the YouTube ID isn't a song known to the source DB. */
    found: boolean;
    info?: SongInfo;
}
