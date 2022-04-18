import { Gender } from "../commands/game_options/gender";

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
