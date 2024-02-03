export interface PlaylistMetadata {
    playlistId: string;
    playlistName: string;
    playlistLength: number;
    matchedSongsLength: number;
    limit: number;
    snapshotID: string;
    thumbnailUrl: string | null;
}
