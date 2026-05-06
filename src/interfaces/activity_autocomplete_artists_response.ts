export default interface ActivityAutocompleteArtistsResponse {
    results: Array<{
        id: number;
        name: string;
        hangulName: string | null;
    }>;
}
