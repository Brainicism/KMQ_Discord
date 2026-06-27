export default interface ActivitySearchSongsResponse {
    results: Array<{
        youtubeLink: string;
        songName: string;
        artistName: string;
        publishYear: number;
    }>;
}
