import type { PlaylistMetadata } from "./playlist_metadata";
import type QueriedSong from "./queried_song";

export interface MatchedPlaylist {
    matchedSongs: Array<QueriedSong>;
    metadata: PlaylistMetadata;
    truncated: boolean;
    unmatchedSongs: Array<string>;
}
