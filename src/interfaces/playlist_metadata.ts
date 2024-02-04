export interface PlaylistMetadata {
    playlistId: string;
    playlistName: string;
    playlistLength: number;
    matchedSongsLength: number;
    limit: number;
    playlistChangeHash: string;
    thumbnailUrl: string | null;
}
