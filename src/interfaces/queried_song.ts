import type { Gender } from "../enums/option_types/gender";

export default interface QueriedSong {
    songName: string;
    originalSongName: string;
    hangulSongName?: string;
    originalHangulSongName?: string;
    artistName: string;
    hangulArtistName?: string;
    youtubeLink: string;
    publishDate?: Date;
    members: Gender;
    artistID: number;
    isSolo: string;
    rank: number;
    views: number;
    tags: string;
    vtype: string;
    selectionWeight: number;
}
