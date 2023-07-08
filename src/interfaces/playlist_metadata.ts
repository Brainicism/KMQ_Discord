export interface PlaylistMetadata {
    playlistID: string;
    playlistName: string;
    playlistLength: number;
    matchedSongsLength: number;
    limit: number;
    snapshotID: string;
    thumbnailUrl: string | null;
}
