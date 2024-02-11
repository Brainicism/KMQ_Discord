import type { AvailableGenders } from "../enums/option_types/gender";

export default interface QueriedSong {
    songName: string;
    originalSongName: string;
    hangulSongName?: string;
    originalHangulSongName?: string;
    artistName: string;
    hangulArtistName: string | null;
    youtubeLink: string;
    originalLink: string | null;
    publishDate: Date;
    members: AvailableGenders;
    artistID: number;
    isSolo: string;
    views: number;
    tags: string | null;
    vtype: string;
    selectionWeight?: number;
}
