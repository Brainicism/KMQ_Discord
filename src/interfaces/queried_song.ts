import type { AvailableGenders } from "../enums/option_types/gender";

export default interface QueriedSong {
    songName: string;
    originalSongName: string;
    hangulSongName?: string;
    originalHangulSongName?: string;
    artistName: string;
    hangulArtistName: string | null;
    youtubeLink: string;
    publishDate: Date;
    members: AvailableGenders;
    artistID: number;
    isSolo: string;
    rank: number;
    views: number;
    tags: string | null;
    vtype: string;
    selectionWeight?: number;
}
